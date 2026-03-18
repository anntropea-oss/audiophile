# Deploy to a VPS (option 3)

This runs the server on a Linux VM so others can use it in a browser.

## 1. Provision a small Ubuntu server

Suggested size: 2 vCPU, 2–4 GB RAM.

## 2. Install Docker + Compose

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 3. Deploy this app

```bash
git clone <your-repo-url> audio-suite
cd audio-suite
docker compose up -d --build
```

The app will be available on `http://YOUR_SERVER_IP:8080`.

## 4. (Optional) Add a custom domain + HTTPS

Use a reverse proxy like Caddy or Nginx if you want a friendly domain + TLS.

### Caddy (simplest)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```
your-domain.com {
  reverse_proxy localhost:8080
}
```

Then:

```bash
sudo systemctl reload caddy
```

## 5. Update

```bash
cd audio-suite
git pull
docker compose up -d --build
```
