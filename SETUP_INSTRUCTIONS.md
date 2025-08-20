# Setup Instructions for NWS Weather Alerts Slack App

## Step-by-Step Setup Guide

### Step 1: Create the Slack App

1. Navigate to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"**
3. Select **"From a manifest"**
4. Choose your workspace
5. Copy the entire contents of `manifest.json` from this repository
6. Paste into the manifest editor
7. Click **"Next"**
8. Review the configuration and click **"Create"**

### Step 2: Generate Required Tokens

#### Bot Token:
1. In your app settings, go to **"OAuth & Permissions"** (left sidebar)
2. Find **"Bot User OAuth Token"**
3. Copy the token (starts with `xoxb-`)
4. Save this for your `.env` file

#### App-Level Token:
1. Go to **"Basic Information"** (left sidebar)
2. Scroll to **"App-Level Tokens"**
3. Click **"Generate Token and Scopes"**
4. Name it: `socket-mode`
5. Add scope: `connections:write`
6. Click **"Generate"**
7. Copy the token (starts with `xapp-`)
8. Save this for your `.env` file

#### Signing Secret:
1. Stay in **"Basic Information"**
2. Find **"Signing Secret"** under "App Credentials"
3. Click **"Show"** and copy the value
4. Save this for your `.env` file

### Step 3: Enable Socket Mode

1. Go to **"Socket Mode"** (left sidebar)
2. Toggle **"Enable Socket Mode"** to ON
3. Confirm if prompted

### Step 4: Install App to Workspace

1. Go to **"Install App"** (left sidebar)
2. Click **"Install to Workspace"**
3. Review permissions and click **"Allow"**

### Step 5: Find Your Channel ID

1. In Slack, right-click on the channel where alerts should be posted
2. Select **"View channel details"**
3. Scroll to bottom and find the Channel ID (starts with C)
4. Copy this ID

### Step 6: Configure the Application

1. In the project directory, create `.env` file:
```bash
cp .env.example .env
```

2. Edit `.env` with your values:
```
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
TARGET_CHANNEL_ID=C09BA83JGNS
POLLING_INTERVAL_MINUTES=5
```

### Step 7: Install Dependencies and Build

```bash
# Install Node.js dependencies
npm install

# Build TypeScript files
npm run build
```

### Step 8: Start the Application

```bash
# For production
npm start

# For development (with auto-reload)
npm run dev
```

### Step 9: Verify Installation

1. Open Slack
2. Find the app in your workspace (look for "NWS Weather Alerts")
3. Click on the app name to open the Home tab
4. You should see the feed management interface
5. The app will begin checking for alerts immediately

### Step 10: Invite Bot to Channel

1. Go to the channel where you want alerts posted
2. Type: `/invite @NWS Weather Alerts`
3. Press Enter

## Configuration Options

### Adding Weather Zones

1. Open the app's Home tab in Slack
2. Click **"Add Feed"**
3. Enter the NWS feed URL for your zone
4. Give it a descriptive name
5. Click **"Add Feed"**

### Finding Zone Codes

- Visit: https://www.weather.gov/pimar/PubZone
- Find your area's zone code
- URL format: `https://api.weather.gov/alerts/active.atom?zone=XXXYYY`
  - XXX = State code (e.g., NJZ for New Jersey zones)
  - YYY = Zone number (e.g., 103)

### Adjusting Polling Interval

Edit `POLLING_INTERVAL_MINUTES` in `.env` file (default is 5 minutes)

## Troubleshooting

### App Not Responding
- Verify Socket Mode is enabled in Slack app settings
- Check that all tokens in `.env` are correct
- Ensure the app is running (`npm start`)

### No Alerts Posting
- Verify bot is invited to the target channel
- Check TARGET_CHANNEL_ID matches your channel
- Look at console logs for errors

### Connection Issues
- Regenerate App-Level Token if needed
- Ensure `connections:write` scope is included
- Check firewall/proxy settings

### Feed Errors
- Verify NWS feed URLs are accessible
- Check zone codes are valid
- Monitor console for specific error messages

## Monitoring

The app logs important events to console:
- Feed checks
- Alerts posted
- Errors encountered

Monitor with:
```bash
npm start 2>&1 | tee app.log
```

## Support Resources

- NWS CAP Documentation: https://vlab.noaa.gov/web/nws-common-alerting-protocol/overview
- Zone Lookup: https://www.weather.gov/pimar/PubZone
- Slack API Docs: https://api.slack.com/