# Detailed Slack App Creation & Installation Guide

## Part 1: Creating the Slack App

### Step 1: Access Slack App Dashboard
1. Open your web browser
2. Navigate to: **https://api.slack.com/apps**
3. Sign in with your Slack workspace credentials
4. You'll see the "Your Apps" dashboard

### Step 2: Create New App from Manifest
1. Click the green **"Create New App"** button
2. You'll see two options - choose **"From a manifest"**
3. Select your workspace from the dropdown (e.g., "Ramsey Rescue Squad")
4. Click **"Next"**

### Step 3: Enter App Manifest
1. You'll see a code editor with tabs for YAML and JSON
2. Make sure **JSON** tab is selected
3. Delete any existing content in the editor
4. Copy the ENTIRE contents below and paste it:

```json
{
  "display_information": {
    "name": "NWS Weather Alerts",
    "description": "National Weather Service CAP weather alerts for Slack",
    "background_color": "#1E3A8A",
    "long_description": "Monitors NWS CAP ATOM XML feeds for weather alerts and posts them to designated Slack channels with detailed information and alert management capabilities."
  },
  "features": {
    "app_home": {
      "home_tab_enabled": true,
      "messages_tab_enabled": false,
      "messages_tab_read_only_enabled": false
    },
    "bot_user": {
      "display_name": "NWS Weather Alerts",
      "always_online": true
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "channels:history",
        "channels:read",
        "chat:write",
        "chat:write.public",
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "im:write",
        "mpim:history",
        "mpim:read",
        "mpim:write",
        "users:read"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "bot_events": [
        "app_home_opened",
        "app_mention"
      ]
    },
    "interactivity": {
      "is_enabled": true
    },
    "org_deploy_enabled": false,
    "socket_mode_enabled": true,
    "token_rotation_enabled": false
  }
}
```

5. Click **"Next"**

### Step 4: Review and Create
1. Review the app configuration summary
2. Verify the Bot User name is "NWS Weather Alerts"
3. Check that Socket Mode is enabled
4. Click **"Create"**

## Part 2: Configuring the App

### Step 5: Install App to Workspace
1. After creation, you'll be on the app's Basic Information page
2. Look for **"Install your app"** section
3. Click **"Install to Workspace"** button
4. Review the permissions (it will show what the bot can do)
5. Click **"Allow"**
6. You'll see "Success! NWS Weather Alerts has been added to Ramsey Rescue Squad"

### Step 6: Get Your Bot Token
1. In the left sidebar, click **"OAuth & Permissions"**
2. Find the section **"OAuth Tokens for Your Workspace"**
3. You'll see **"Bot User OAuth Token"**
4. Click **"Copy"** button next to the token (starts with `xoxb-`)
5. **SAVE THIS TOKEN** - we'll need it shortly

### Step 7: Create App-Level Token for Socket Mode
1. In the left sidebar, click **"Basic Information"**
2. Scroll down to **"App-Level Tokens"** section
3. Click **"Generate Token and Scopes"** button
4. In the dialog:
   - **Token Name**: Enter `socket-mode`
   - **Add Scope**: Click "Add Scope" and select `connections:write`
5. Click **"Generate"**
6. **IMPORTANT**: Copy the token immediately (starts with `xapp-`)
7. Click **"Done"**
8. **SAVE THIS TOKEN** - you won't be able to see it again

### Step 8: Get Signing Secret
1. Stay on **"Basic Information"** page
2. In **"App Credentials"** section, find **"Signing Secret"**
3. Click **"Show"** button
4. Copy the revealed secret
5. **SAVE THIS SECRET**

### Step 9: Verify Socket Mode is Enabled
1. In the left sidebar, click **"Socket Mode"**
2. Make sure the toggle switch shows **"Socket Mode is enabled"**
3. If not enabled, click the toggle to enable it

## Part 3: Configure the Application

### Step 10: Set Up Environment File
1. Open Terminal/Command Prompt
2. Navigate to the app directory:
```bash
cd /Users/davidbrown/nws-weather-alerts-slack
```

3. Create the .env file from template:
```bash
cp .env.example .env
```

4. Open .env in a text editor:
```bash
open .env
```

5. Replace the placeholder values with your actual tokens:
```
SLACK_BOT_TOKEN=xoxb-[paste your bot token here]
SLACK_APP_TOKEN=xapp-[paste your app token here]
SLACK_SIGNING_SECRET=[paste your signing secret here]
TARGET_CHANNEL_ID=C09BA83JGNS
POLLING_INTERVAL_MINUTES=5
```

6. Save the file

## Part 4: Install and Run the Application

### Step 11: Install Dependencies
```bash
npm install
```

### Step 12: Build the TypeScript Files
```bash
npm run build
```

### Step 13: Start the Application
```bash
npm start
```

You should see:
```
⚡️ NWS Weather Alerts Slack app is running!
Checking for weather alerts...
```

## Part 5: Set Up in Slack

### Step 14: Add Bot to Channel
1. Open Slack
2. Go to channel #C09BA83JGNS (or your target channel)
3. In the message input, type:
```
/invite @NWS Weather Alerts
```
4. Press Enter
5. You'll see "NWS Weather Alerts has been added to the channel"

### Step 15: Access App Home
1. In Slack's left sidebar, find **"Apps"** section
2. Click the **"+"** next to Apps
3. Search for "NWS Weather Alerts"
4. Click on the app
5. You'll see the Home tab with feed management interface

## Part 6: Verify Everything is Working

### Step 16: Check App Home
1. In the NWS Weather Alerts app home, you should see:
   - Header: "🌦️ NWS Weather Alerts Manager"
   - Two default feeds for Bergen County NJ
   - "Add Feed" button
   - Statistics showing 2 total feeds

### Step 17: Test Alert Functionality
The app will automatically check for alerts every 5 minutes. You can verify it's working by:
1. Checking the terminal where the app is running for "Checking for weather alerts..." messages
2. Monitoring the target channel for any active weather alerts

## Troubleshooting

### If the app doesn't appear in Slack:
1. Make sure the app is running (`npm start`)
2. Refresh Slack (Cmd+R or Ctrl+R)
3. Check that Socket Mode is enabled in app settings

### If you see "invalid_auth" errors:
1. Double-check all tokens in .env file
2. Make sure there are no extra spaces or quotes around tokens
3. Regenerate tokens if necessary

### If Home tab doesn't load:
1. Check console for errors
2. Verify app_home_opened event is in the manifest
3. Make sure Interactivity is enabled

## Token Reference

You should have collected these three values:
1. **Bot Token** (xoxb-...): OAuth & Permissions page
2. **App Token** (xapp-...): Basic Information → App-Level Tokens
3. **Signing Secret**: Basic Information → App Credentials

## Next Steps

1. The app is now monitoring the default Bergen County zones
2. To add more zones, use the "Add Feed" button in App Home
3. Find additional zone codes at: https://www.weather.gov/pimar/PubZone
4. Alerts will automatically post to your configured channel

## Support

- Check terminal/console for error messages
- Verify all tokens are correctly entered in .env
- Ensure the bot is invited to the target channel
- Make sure Socket Mode is enabled