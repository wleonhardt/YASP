import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface Ec2OriginBootstrapProps {
  readonly awsRegion: string;
  readonly imageIdentifier: string;
  readonly originSecret: string;
  readonly originSecretHeaderName: string;
  readonly registryUri: string;
  readonly containerPort: number;
  readonly originPort: number;
  readonly containerName: string;
}

export function buildEc2OriginUserData(
  props: Ec2OriginBootstrapProps
): ec2.UserData {
  const userData = ec2.UserData.forLinux();

  userData.addCommands(
    "set -euxo pipefail",
    "dnf install -y docker nginx awscli",
    "systemctl enable --now docker",
    "systemctl enable --now amazon-ssm-agent || true",
    "rm -f /etc/nginx/conf.d/default.conf",
    "cat <<'EOF' >/etc/nginx/conf.d/yasp.conf",
    "map_hash_bucket_size 128;",
    "",
    "map $http_upgrade $connection_upgrade {",
    "  default upgrade;",
    "  '' close;",
    "}",
    "",
    `map $http_${props.originSecretHeaderName.replace(/-/g, "_")} $origin_secret_valid {`,
    "  default 0;",
    `  \"${props.originSecret}\" 1;`,
    "}",
    "",
    "server {",
    `  listen ${props.originPort} default_server;`,
    `  listen [::]:${props.originPort} default_server;`,
    "  server_name _;",
    "",
    "  if ($origin_secret_valid = 0) {",
    "    return 403;",
    "  }",
    "",
    "  location / {",
    `    proxy_pass http://127.0.0.1:${props.containerPort};`,
    "    proxy_http_version 1.1;",
    "    proxy_set_header Host $host;",
    "    proxy_set_header X-Real-IP $remote_addr;",
    "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "    proxy_set_header X-Forwarded-Proto https;",
    "    proxy_set_header X-Forwarded-Host $host;",
    "    proxy_set_header Upgrade $http_upgrade;",
    "    proxy_set_header Connection $connection_upgrade;",
    "    proxy_read_timeout 3600s;",
    "    proxy_send_timeout 3600s;",
    "    proxy_buffering off;",
    "  }",
    "}",
    "EOF",
    "nginx -t",
    "cat <<'EOF' >/usr/local/bin/yasp-run.sh",
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `AWS_REGION=\"${props.awsRegion}\"`,
    `REGISTRY_URI=\"${props.registryUri}\"`,
    `IMAGE_IDENTIFIER=\"${props.imageIdentifier}\"`,
    `CONTAINER_NAME=\"${props.containerName}\"`,
    "",
    "aws ecr get-login-password --region \"$AWS_REGION\" | \\",
    "  docker login --username AWS --password-stdin \"$REGISTRY_URI\"",
    "",
    "docker pull \"$IMAGE_IDENTIFIER\"",
    "docker rm -f \"$CONTAINER_NAME\" >/dev/null 2>&1 || true",
    "",
    "exec docker run \\",
    "  --rm \\",
    "  --name \"$CONTAINER_NAME\" \\",
    `  --publish 127.0.0.1:${props.containerPort}:${props.containerPort} \\`,
    "  --env NODE_ENV=production \\",
    `  --env PORT=${props.containerPort} \\`,
    "  --log-opt max-size=10m \\",
    "  --log-opt max-file=3 \\",
    "  \"$IMAGE_IDENTIFIER\"",
    "EOF",
    "chmod 755 /usr/local/bin/yasp-run.sh",
    "cat <<'EOF' >/etc/systemd/system/yasp.service",
    "[Unit]",
    "Description=YASP Docker container",
    "After=docker.service network-online.target",
    "Wants=docker.service network-online.target",
    "StartLimitIntervalSec=0",
    "",
    "[Service]",
    "Type=simple",
    "Restart=always",
    "RestartSec=30",
    "TimeoutStartSec=0",
    "TimeoutStopSec=30",
    "ExecStart=/usr/local/bin/yasp-run.sh",
    `ExecStop=-/usr/bin/docker stop ${props.containerName}`,
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "EOF",
    "systemctl daemon-reload",
    "systemctl enable --now nginx",
    "systemctl enable --now yasp.service"
  );

  return userData;
}
