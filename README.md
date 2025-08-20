# NWS Weather Alerts Slack App

A mission-critical Slack application that monitors National Weather Service (NWS) CAP ATOM XML feeds for weather alerts and posts them to your Slack workspace with enterprise-grade reliability.

## Features

### Core Functionality
- **Real-time Weather Alerts**: Monitors NWS CAP feeds and posts alerts to designated Slack channel
- **Multiple Feed Support**: Subscribe to multiple weather zones simultaneously  
- **App Home Management**: Admin interface to add, pause, or remove feed subscriptions
- **Alert Details Modal**: Expandable view for complete alert information
- **Severity Indicators**: Visual cues for alert urgency and severity levels
- **Automatic Polling**: Checks for new alerts every 5 minutes (configurable)

### Production Features
- **24/7 Monitoring**: Auto-restart on failures with health checks every 30 seconds
- **System Service**: Runs as macOS LaunchAgent for persistent operation
- **Error Recovery**: Automatic connection recovery and failure notifications
- **Production Logging**: Comprehensive logs with rotation and error tracking
- **Admin Notifications**: Critical alerts sent to administrators

## Quick Start

### 1. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From a manifest"
3. Select your workspace
4. Copy and paste the contents of `manifest.json`
5. Review and create the app

### 2. Configure App Tokens

1. In your app settings, go to "Basic Information"
2. Under "App-Level Tokens", create a token with `connections:write` scope
3. Copy the token (starts with `xapp-`)
4. Go to "OAuth & Permissions" and copy the Bot User OAuth Token (starts with `xoxb-`)

### 3. Set Up Environment

```bash
# Clone or download this repository
cd nws-weather-alerts-slack

# Install dependencies
npm install

# Build TypeScript files
npm run build

# Create .env file
cp .env.example .env
```

### 4. Configure Environment Variables

Create `.env` file with your Slack app credentials:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
TARGET_CHANNEL_ID=C09BA83JGNS
POLLING_INTERVAL_MINUTES=5
```

### 5. Configure Admin Users

Edit `config/admins.js` to add your Slack user ID:

```javascript
const ADMIN_USERS = ['YOUR_USER_ID_HERE'];
```

Find your user ID by clicking your profile in Slack → More → Copy Member ID

### 6. Run the App

```bash
# Start the app
npm start

# Or for development with auto-reload
npm run dev

# For production with monitoring
node app-production.js
```

## Security Considerations

- **Environment Variables**: Never commit `.env` files to version control
- **Admin Configuration**: Restrict admin access to trusted users only
- **Data Storage**: Local JSON files contain subscription data - secure appropriately
- **Service Installation**: LaunchAgent runs with user permissions only
- **Slack Tokens**: Rotate tokens regularly and monitor usage

## Default Weather Zones

The app comes pre-configured with:
- **NJZ103**: Western Bergen County, NJ
- **NJZ104**: Eastern Bergen County, NJ

## Adding New Feeds

1. Open your Slack workspace
2. Go to the app's Home tab
3. Click "Add Feed"
4. Enter the NWS feed URL and a descriptive name
5. Click "Add Feed"

Find zone codes at: https://www.weather.gov/pimar/PubZone

## Alert Format

Alerts are posted with:
- Severity level (Extreme, Severe, Moderate, Minor)
- Urgency indicator (Immediate 🚨, Expected ⚠️, Future 📢)
- Affected areas
- Summary information
- Effective and expiration times
- "View Full Details" button for complete information

## Production Deployment

### System Service Installation

For 24/7 operation, install as a system service:

```bash
# Install as macOS LaunchAgent
./install-service.sh

# Check service status
launchctl list | grep weather-alerts

# Monitor logs
tail -f logs/service.log
```

### Health Monitoring

The production app includes comprehensive monitoring:
- Health checks every 30 seconds
- Auto-restart on failures
- Connection monitoring with Slack
- Admin notifications for critical issues
- Performance metrics and logging

## Architecture

### Core Components

- **Socket Mode Connection**: Persistent WebSocket connection to Slack
- **CAP Parser**: TypeScript service for XML feed processing  
- **Alert Formatter**: Rich message formatting with Slack Block Kit
- **Data Store**: JSON-based subscription management
- **Admin System**: Permission-based feed management

### File Structure

```
nws-weather-alerts-slack/
├── app.js                     # Development version
├── app-production.js          # Production version with monitoring
├── functions/
│   ├── alert-formatter.js     # Alert message formatting
│   ├── data-store.js         # Feed subscription management
│   └── home-builder.js       # Slack UI builders
├── src/
│   ├── services/
│   │   └── capParser.ts      # XML parser for CAP feeds
│   ├── types/                # TypeScript type definitions
│   └── config/              # Configuration
├── config/
│   └── admins.js            # Admin user configuration
├── data/                    # Local storage for subscriptions (gitignored)
├── logs/                    # Application logs (gitignored)
├── manifest.json           # Slack app manifest
├── install-service.sh      # System service installer
└── package.json
```

## Commands

### Development
- `npm start` - Start the development application
- `npm run dev` - Start with nodemon for development
- `npm run build` - Compile TypeScript files

### Production
- `node app-production.js` - Start production version
- `./install-service.sh` - Install as system service
- `./start-production.sh` - Manual production start

## Troubleshooting

1. **App not responding**: Check that socket mode is enabled in your Slack app settings
2. **No alerts posting**: Verify the TARGET_CHANNEL_ID in .env matches your channel
3. **Feed errors**: Ensure the NWS feed URLs are valid and accessible

## Support

For NWS CAP documentation: https://vlab.noaa.gov/web/nws-common-alerting-protocol/overview
For zone lookups: https://www.weather.gov/pimar/PubZone