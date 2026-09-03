# Paste this ONCE in AWS → EC2 → Connect (EC2 Instance Connect) as ubuntu:

mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIItbIWbIhDkwsnD6WQ8v0B86+Mhx+w80R65qpJ0k4KVM github-actions-conninter-deploy' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
