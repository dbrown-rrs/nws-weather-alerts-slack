import { AppConfig } from '../types';

export const config: AppConfig = {
  slackBotToken: process.env.SLACK_BOT_TOKEN || '',
  slackAppToken: process.env.SLACK_APP_TOKEN || '',
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET || '',
  targetChannelId: process.env.TARGET_CHANNEL_ID || 'C09BA83JGNS',
  dynamoTableName: process.env.DYNAMO_TABLE_NAME || 'nws-weather-alerts',
  pollingIntervalMinutes: parseInt(process.env.POLLING_INTERVAL_MINUTES || '5', 10)
};

export const DEFAULT_FEEDS = [
  {
    url: 'https://api.weather.gov/alerts/active.atom?zone=NJZ103',
    zone: 'NJZ103',
    name: 'Western Bergen County, NJ'
  },
  {
    url: 'https://api.weather.gov/alerts/active.atom?zone=NJZ104',
    zone: 'NJZ104', 
    name: 'Eastern Bergen County, NJ'
  }
];