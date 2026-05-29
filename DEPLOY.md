# FreeLLMAPI Deployment Guide

This guide describes how to deploy **FreeLLMAPI** so that you can access your proxy and dashboard from anywhere.

Since the application uses a local SQLite database (`freeapi.db`) to store API keys and settings, **you must use persistent volume storage** in your deployment. Otherwise, your settings and keys will be lost when the container restarts.

---

## Prerequisites: Generate your `ENCRYPTION_KEY`

All API keys are encrypted at rest inside the database using AES-256-GCM. You **must** configure a 64-character hexadecimal encryption key. 

Generate one locally by running:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Keep this key safe! If this key changes, any previously saved keys in the database will be unreadable and throw errors.

---

## Option 1: Fly.io (Recommended & Free/Low-Cost)

Fly.io provides a generous free tier that includes 3GB of persistent storage across all apps, which is perfect for SQLite.

### 1. Install Fly CLI & Login
Follow the installation guide for your OS on [Fly.io Docs](https://fly.io/docs/hands-on/install-flyctl/). Once installed, log in:
```bash
fly auth login
```

### 2. Initialize the App
Run the following command from the root of the project:
```bash
fly launch
```
- Fly will detect the `Dockerfile` and ask configuration questions.
- Select your preferred region.
- When asked if you want to copy configuration to a new file, select **Yes** (this creates a `fly.toml` file).
- Do **not** deploy immediately yet (say No to deploy, or wait until after setting secrets).

### 3. Create a Persistent Storage Volume
To persist your SQLite database, create a 1GB persistent volume in the region you selected during launch (replace `your-app-name` and `syd` / your region accordingly):
```bash
fly volumes create freellmapi_data --region syd --size 1
```

### 4. Configure `fly.toml`
Open the generated `fly.toml` in your editor. Under the `[mounts]` section (create it if it doesn't exist), configure the volume:
```toml
[mounts]
  source = "freellmapi_data"
  destination = "/app/server/data"
```

Also, ensure the HTTP service points to port `3001` (where the app runs inside the container):
```toml
[[services]]
  http_service_port = 3001
  internal_port = 3001
  # ... (other default settings)
```

### 5. Set Your Secrets
Set your database encryption key as a secret. This will be injected into the container environment securely:
```bash
fly secrets set ENCRYPTION_KEY="your-64-character-hex-key"
```

### 6. Deploy the App
Finally, deploy your container to Fly:
```bash
fly deploy
```
Once deployed, Fly will output your public app URL (e.g., `https://your-app-name.fly.dev`). Open it in a browser to access the dashboard!

---

## Option 2: Render.com (Simple UI-based PaaS)

Render makes it easy to deploy Docker applications, though a persistent disk is only available on their paid instance types (starting at ~$7/month).

### 1. Push Code to GitHub
Ensure you have committed your changes (including the `Dockerfile` and `.dockerignore`) and pushed them to your GitHub repository.

### 2. Create a Web Service on Render
1. Log in to [Render Dashboard](https://dashboard.render.com/) and click **New > Web Service**.
2. Connect your GitHub repository.
3. Configure the service:
   - **Name**: `freellmapi`
   - **Environment**: `Docker`
   - **Instance Type**: Select **Starter** or higher (persistent disks are not supported on the free instance type).
4. Click **Advanced** and add the following:
   - **Environment Variables**:
     - Key: `ENCRYPTION_KEY`, Value: `your-64-character-hex-key`
     - Key: `PORT`, Value: `3001`
   - **Disk (Persistent Storage)**:
     - Click **Add Disk**.
     - **Name**: `freellmapi-data`
     - **Mount Path**: `/app/server/data`
     - **Size**: `1 GiB` (minimum size)
5. Click **Create Web Service**.

Render will build the Docker container and deploy it, serving the app on HTTPS.

---

## Option 3: VPS or Home Server (Self-Hosted)

If you own a virtual private server (e.g., DigitalOcean, Hetzner, AWS EC2, Linode) or run a home server (e.g., Raspberry Pi) running Linux, you can run the app easily via Docker Compose.

### 1. Setup Environment
Clone the repository onto your server and create a `.env` file in the root:
```bash
PORT=3001
ENCRYPTION_KEY="your-64-character-hex-key"
```

### 2. Start the App
Run the following command to build the image and run it in the background:
```bash
docker compose up -d --build
```
This builds the Docker image and mounts a local docker volume named `freellmapi_data` to persist `/app/server/data`.

### 3. Setup Nginx / Caddy (Optional for HTTPS)
We recommend setting up Nginx, Caddy, or Traefik as a reverse proxy to handle SSL (HTTPS) certificates and secure your dashboard. Here is a simple Caddy configuration:
```caddy
yourdomain.com {
    reverse_proxy localhost:3001
}
```

---

## Testing Your Remote Deployment

1. **Access the Dashboard**: Open your deployed URL (e.g., `https://freellmapi.yourdomain.com` or `https://your-app.fly.dev`).
2. **Login/Manage Keys**: Check that you can add API keys.
3. **Verify API Access**: Point any OpenAI-compatible client to your remote URL:
   ```python
   from openai import OpenAI
   
   client = OpenAI(
       base_url="https://your-app.fly.dev/v1",
       api_key="freellmapi-your-unified-key",
   )
   
   response = client.chat.completions.create(
       model="auto",
       messages=[{"role": "user", "content": "Hello!"}]
   )
   print(response.choices[0].message.content)
   ```
