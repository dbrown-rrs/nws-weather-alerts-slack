import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { FeedSubscription } from '../types';
import { config } from '../config';

export class DatabaseService {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;
  
  constructor() {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = config.dynamoTableName;
  }
  
  async getAllSubscriptions(): Promise<FeedSubscription[]> {
    try {
      const command = new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'itemType = :type AND active = :active',
        ExpressionAttributeValues: {
          ':type': 'subscription',
          ':active': true
        }
      });
      
      const response = await this.docClient.send(command);
      return (response.Items || []) as FeedSubscription[];
    } catch (error) {
      console.error('Error getting subscriptions:', error);
      return [];
    }
  }
  
  async addSubscription(subscription: Omit<FeedSubscription, 'id' | 'addedAt'>): Promise<FeedSubscription> {
    const newSubscription: FeedSubscription = {
      ...subscription,
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      addedAt: new Date().toISOString()
    };
    
    const command = new PutCommand({
      TableName: this.tableName,
      Item: {
        ...newSubscription,
        itemType: 'subscription'
      }
    });
    
    await this.docClient.send(command);
    return newSubscription;
  }
  
  async removeSubscription(id: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: { id }
    });
    
    await this.docClient.send(command);
  }
  
  async updateSubscriptionStatus(id: string, active: boolean): Promise<void> {
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { id },
      UpdateExpression: 'SET active = :active',
      ExpressionAttributeValues: {
        ':active': active
      }
    });
    
    await this.docClient.send(command);
  }
  
  async updateLastAlert(subscriptionId: string, alertId: string): Promise<void> {
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { id: subscriptionId },
      UpdateExpression: 'SET lastAlertId = :alertId, lastChecked = :now',
      ExpressionAttributeValues: {
        ':alertId': alertId,
        ':now': new Date().toISOString()
      }
    });
    
    await this.docClient.send(command);
  }
  
  async isAlertProcessed(alertId: string): Promise<boolean> {
    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: { id: alertId }
      });
      
      const response = await this.docClient.send(command);
      return !!response.Item;
    } catch {
      return false;
    }
  }
  
  async markAlertProcessed(alertId: string): Promise<void> {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: {
        id: alertId,
        itemType: 'processedAlert',
        processedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
      }
    });
    
    await this.docClient.send(command);
  }
}