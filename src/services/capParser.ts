import { parseStringPromise } from 'xml2js';
import fetch from 'node-fetch';
import { WeatherAlert } from '../types';

export class CAPParser {
  async fetchAndParseFeed(feedUrl: string): Promise<WeatherAlert[]> {
    try {
      const response = await fetch(feedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch feed: ${response.statusText}`);
      }
      
      const xmlText = await response.text();
      const parsed = await parseStringPromise(xmlText, {
        explicitArray: false,
        ignoreAttrs: true,
        tagNameProcessors: [(name: string) => name.replace('cap:', '')]
      });
      
      if (!parsed.feed) {
        throw new Error('Invalid feed structure');
      }
      
      const entries = parsed.feed.entry;
      if (!entries) {
        return [];
      }
      
      const entriesArray = Array.isArray(entries) ? entries : [entries];
      
      return entriesArray.map(entry => this.parseEntry(entry));
    } catch (error) {
      console.error(`Error fetching/parsing feed ${feedUrl}:`, error);
      throw error;
    }
  }
  
  private parseEntry(entry: any): WeatherAlert {
    const alert: WeatherAlert = {
      id: entry.id || '',
      title: entry.title || '',
      updated: entry.updated || '',
      published: entry.published,
      summary: entry.summary || '',
      link: entry.link?.href || entry.link || ''
    };
    
    if (entry.event) alert.event = entry.event;
    if (entry.effective) alert.effective = entry.effective;
    if (entry.expires) alert.expires = entry.expires;
    if (entry.status) alert.status = entry.status;
    if (entry.msgType) alert.msgType = entry.msgType;
    if (entry.category) alert.category = entry.category;
    if (entry.urgency) alert.urgency = entry.urgency;
    if (entry.severity) alert.severity = entry.severity;
    if (entry.certainty) alert.certainty = entry.certainty;
    if (entry.areaDesc) alert.areaDesc = entry.areaDesc;
    if (entry.polygon) alert.polygon = entry.polygon;
    
    if (entry.geocode) {
      alert.geocode = {};
      if (entry.geocode.SAME) {
        alert.geocode.SAME = Array.isArray(entry.geocode.SAME) 
          ? entry.geocode.SAME 
          : [entry.geocode.SAME];
      }
      if (entry.geocode.UGC) {
        alert.geocode.UGC = Array.isArray(entry.geocode.UGC) 
          ? entry.geocode.UGC 
          : [entry.geocode.UGC];
      }
    }
    
    if (entry.parameter) {
      alert.parameters = {};
      const params = Array.isArray(entry.parameter) ? entry.parameter : [entry.parameter];
      params.forEach((param: any) => {
        if (param.valueName && param.value) {
          alert.parameters![param.valueName] = Array.isArray(param.value) 
            ? param.value 
            : [param.value];
        }
      });
    }
    
    return alert;
  }
  
  getSeverityColor(severity?: string): string {
    switch(severity?.toLowerCase()) {
      case 'extreme': return '#8B0000';
      case 'severe': return '#FF0000';
      case 'moderate': return '#FFA500';
      case 'minor': return '#FFD700';
      case 'unknown': 
      default: return '#808080';
    }
  }
  
  getUrgencyEmoji(urgency?: string): string {
    switch(urgency?.toLowerCase()) {
      case 'immediate': return '🚨';
      case 'expected': return '⚠️';
      case 'future': return '📢';
      case 'past': return '📋';
      case 'unknown':
      default: return 'ℹ️';
    }
  }
}