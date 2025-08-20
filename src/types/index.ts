export interface WeatherAlert {
  id: string;
  title: string;
  updated: string;
  published?: string;
  summary: string;
  event?: string;
  effective?: string;
  expires?: string;
  status?: string;
  msgType?: string;
  category?: string;
  urgency?: string;
  severity?: string;
  certainty?: string;
  areaDesc?: string;
  polygon?: string;
  geocode?: {
    SAME?: string[];
    UGC?: string[];
  };
  parameters?: Record<string, string[]>;
  link?: string;
}

export interface FeedSubscription {
  id: string;
  url: string;
  zone?: string;
  name: string;
  active: boolean;
  lastChecked?: string;
  lastAlertId?: string;
  addedBy?: string;
  addedAt: string;
}

export interface AppConfig {
  slackBotToken: string;
  slackAppToken: string;
  slackSigningSecret: string;
  targetChannelId: string;
  dynamoTableName: string;
  pollingIntervalMinutes: number;
}

export interface SlackUser {
  id: string;
  isAdmin: boolean;
}