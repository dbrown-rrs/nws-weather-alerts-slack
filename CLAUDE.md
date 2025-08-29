# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **NWS Weather Alerts Slack App** - a mission-critical application that monitors National Weather Service CAP ATOM feeds for weather alerts and posts them to Slack workspaces. The app also provides interactive slash commands for weather forecasting.

## Development Commands

### Build and Development
- `npm start` - Start development version
- `npm run dev` - Start with nodemon (auto-reload)
- `npm run build` - Compile TypeScript files (src/ → dist/)
- `node app-production.js` - Start production version with monitoring

### Production Deployment
- `./install-service.sh` - Install as macOS LaunchAgent system service
- `./start-production.sh` - Manual production start
- `launchctl list | grep weather-alerts` - Check service status
- `tail -f logs/service.log` - Monitor application logs

### Testing and Debugging
- Multiple test files available (`test-*.js`) for different components
- `diagnose.js` - Diagnostic utilities
- Manual test scripts for alerts (`manual-test-alert.js`)

## Architecture Overview

### Core Components

1. **Socket Mode Slack App** (`app.js`)
   - Main application entry point using @slack/bolt
   - Handles slash commands, interactive actions, and app home
   - Implements health monitoring and auto-recovery

2. **Weather Services Layer** (`services/`)
   - `forecast-service.js` - Main weather data coordination with caching
   - `nws-api-client.js` - National Weather Service API client
   - `weather-formatter.js` - Slack Block Kit message formatting
   - `location-service.js` - Location input parsing and coordinates

3. **Alert Processing** (`src/services/`)
   - `capParser.ts` - TypeScript CAP (Common Alerting Protocol) XML parser
   - Processes NWS alert feeds and extracts structured data

4. **Data Management** (`functions/`)
   - `data-store.js` - JSON-based subscription and alert tracking
   - `location-manager.js` - User location preferences
   - `home-builder.js` - Slack App Home interface generation
   - `alert-formatter.js` - Alert message formatting for Slack

### Key Features

- **Real-time Alert Monitoring**: Polls NWS CAP feeds every 5 minutes
- **Weather Slash Commands**: `/weather-forecast`, `/weather-current`, `/weather-hourly`
- **Location Management**: Save and manage favorite locations
- **Interactive UI**: Slack App Home with admin controls
- **Production Monitoring**: Health checks, auto-restart, admin notifications

## Code Patterns and Conventions

### Error Handling
- All async operations wrapped in try/catch blocks
- Descriptive error messages for user-facing failures
- Console logging for debugging with timestamps
- Graceful degradation when services are unavailable

### API Integration
- Uses node-fetch for HTTP requests to NWS API
- Implements caching in `forecast-service.js` (30-minute default)
- User-Agent header required: `'NWS-Weather-Alerts-Slack/1.0 (contact@example.com)'`
- All NWS API calls go through `nws-api-client.js`

### Data Storage
- JSON files in `data/` directory (gitignored)
- `subscriptions.json` - Alert feed subscriptions
- `weather-cache.json` - Weather data cache
- Location data stored per-user in location service

### Slack Integration
- Socket Mode for real-time event handling
- Block Kit for rich message formatting
- Modal interactions for admin functions
- Slash command response patterns with loading states

### TypeScript Integration
- Mixed JS/TS codebase: main app in JS, services in TS
- Build step compiles `src/` to `dist/`
- Type definitions in `src/types/`

## Common Development Tasks

### Adding New Slash Commands
1. Define command handler in `app.js` using `app.command('/command-name', handler)`
2. Add immediate acknowledgment with loading message
3. Use services to fetch data, then `respond()` with formatted results
4. Follow existing patterns for error handling and user feedback

### Extending Weather Data
1. Add new methods to `nws-api-client.js` for additional NWS endpoints
2. Update `forecast-service.js` to coordinate new data sources
3. Extend `weather-formatter.js` for new display formats
4. Update TypeScript interfaces in `src/types/` as needed

### Modifying Alert Processing
1. Update CAP parser in `src/services/capParser.ts` for new alert fields
2. Modify `alert-formatter.js` for new alert display formats
3. Update subscription management in `data-store.js` if needed

### Configuration Management
- Environment variables in `.env` file (not committed)
- Admin users configured in `config/admins.js`
- Slack app manifest in `manifest.json`
- Production settings in `app-production.js`

## Known Issues and Considerations

### Socket Mode Timing
- Slash commands have trigger_id expiration (3 seconds)
- Loading modals used to consume trigger_ids immediately
- Fallback to message-based UI when modals fail

### Temperature Unit Bug
**CRITICAL**: Current temperature display shows Celsius values with °F labels. The NWS API returns temperature observations in Celsius by default, but the weather formatter hardcodes 'F' units in `formatCurrentObservation()` and other current temperature displays.

**Fix needed in `services/weather-formatter.js`:**
- Lines 144, 206, 377: Use actual temperature unit from API response
- Convert Celsius to Fahrenheit when displaying current observations
- Check `currentObservation.temperature.unitCode` for proper unit handling

### Production Considerations
- LaunchAgent service runs with user permissions only
- Health monitoring prevents false positive alerts with 15-minute grace period
- Connection recovery handles Slack API timeouts
- Log rotation needed for long-term operation

## Testing Patterns
- Manual testing scripts for different scenarios
- Diagnostic tools for debugging API issues
- Test alert posting with various alert types
- Mock data in action handlers for reliable testing

## Security Notes
- Never commit `.env` files or API keys
- Admin permissions restrict feed management
- Local JSON storage - secure file permissions needed
- User-Agent headers identify the application to NWS