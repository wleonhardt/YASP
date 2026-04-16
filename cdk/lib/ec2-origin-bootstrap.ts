import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface Ec2OriginBootstrapProps {
  readonly awsRegion: string;
  readonly imageIdentifier: string;
  readonly originSecret: string;
  readonly originSecretHeaderName: string;
  readonly logGroupName: string;
  readonly registryUri: string;
  readonly containerPort: number;
  readonly originPort: number;
  readonly containerName: string;
}

export function buildEc2OriginUserData(props: Ec2OriginBootstrapProps): ec2.UserData {
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
    `  "${props.originSecret}" 1;`,
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
    `AWS_REGION="${props.awsRegion}"`,
    `REGISTRY_URI="${props.registryUri}"`,
    `IMAGE_IDENTIFIER="${props.imageIdentifier}"`,
    `CONTAINER_NAME="${props.containerName}"`,
    `LOG_GROUP_NAME="${props.logGroupName}"`,
    "",
    'aws ecr get-login-password --region "$AWS_REGION" | \\',
    '  docker login --username AWS --password-stdin "$REGISTRY_URI"',
    "",
    'TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" || true)"',
    'if [ -n "$TOKEN" ]; then',
    '  INSTANCE_ID="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id || hostname)"',
    "else",
    '  INSTANCE_ID="$(hostname)"',
    "fi",
    'LOG_STREAM_NAME="${CONTAINER_NAME}-${INSTANCE_ID}"',
    "",
    "log_disk_state() {",
    "  echo '--- df -h ---'",
    "  df -h / /var/lib/docker 2>&1 || df -h / 2>&1 || true",
    "  echo '--- docker system df ---'",
    "  docker system df 2>&1 || true",
    "}",
    "",
    "reclaim_docker_space() {",
    "  # Dedicated single-service host: reclaim unused Docker state before",
    "  # pulling the next immutable image tag so repeated deploys do not fill",
    "  # /var/lib/docker with abandoned layers and caches.",
    "  echo '--- disk state before Docker reclaim ---'",
    "  log_disk_state",
    "  docker container prune -f 2>&1 || true",
    "  docker image prune -af 2>&1 || true",
    "  docker builder prune -af 2>&1 || true",
    "  docker volume prune -f 2>&1 || true",
    "  echo '--- disk state after Docker reclaim ---'",
    "  log_disk_state",
    "}",
    "",
    "reclaim_docker_space",
    "",
    'docker pull "$IMAGE_IDENTIFIER"',
    'docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true',
    "",
    // Runtime hardening flags (SECURITY_REMEDIATION_PLAN.md / F-16):
    //   --read-only                 : rootfs is immutable; app never writes to it
    //   --tmpfs /tmp                 : the only writable path, sized at 64 MiB
    //   --cap-drop ALL               : drop every Linux capability; Node web
    //                                   servers don't need any of them
    //   --security-opt no-new-privileges : block setuid escalation post-exec
    //   --pids-limit 256             : bound fork bombs from an RCE
    //   --memory / --memory-swap     : equal values disable swap; caps total RSS
    //   --cpus                       : prevent a crashed/abusive container from
    //                                   hogging the EC2 instance
    // --publish stays loopback-only; CloudWatch logs driver is unaffected by
    // --read-only because log writes happen outside the container.
    "exec docker run \\",
    "  --rm \\",
    '  --name "$CONTAINER_NAME" \\',
    `  --publish 127.0.0.1:${props.containerPort}:${props.containerPort} \\`,
    "  --read-only \\",
    "  --tmpfs /tmp:rw,nosuid,nodev,size=64m \\",
    "  --cap-drop ALL \\",
    "  --security-opt no-new-privileges \\",
    "  --pids-limit 256 \\",
    "  --memory 512m \\",
    "  --memory-swap 512m \\",
    "  --cpus 1.0 \\",
    "  --env NODE_ENV=production \\",
    `  --env PORT=${props.containerPort} \\`,
    "  --log-driver awslogs \\",
    '  --log-opt awslogs-region="$AWS_REGION" \\',
    '  --log-opt awslogs-group="$LOG_GROUP_NAME" \\',
    '  --log-opt awslogs-stream="$LOG_STREAM_NAME" \\',
    "  --log-opt awslogs-create-group=false \\",
    '  "$IMAGE_IDENTIFIER"',
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
