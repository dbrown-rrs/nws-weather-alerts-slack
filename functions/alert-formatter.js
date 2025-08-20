function getSeverityColor(severity) {
  switch(severity?.toLowerCase()) {
    case 'extreme': return '#8B0000';
    case 'severe': return '#FF0000';
    case 'moderate': return '#FFA500';
    case 'minor': return '#FFD700';
    case 'unknown': 
    default: return '#808080';
  }
}

function getUrgencyEmoji(urgency) {
  switch(urgency?.toLowerCase()) {
    case 'immediate': return '🚨';
    case 'expected': return '⚠️';
    case 'future': return '📢';
    case 'past': return '📋';
    case 'unknown':
    default: return 'ℹ️';
  }
}

function formatAlertMessage(alert) {
  const emoji = getUrgencyEmoji(alert.urgency);
  return `${emoji} Weather Alert: ${alert.title || 'New Alert'}`;
}

function formatAlertBlocks(alert, subscription) {
  const emoji = getUrgencyEmoji(alert.urgency);
  const color = getSeverityColor(alert.severity);
  
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} Weather Alert - ${subscription.name}`,
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${alert.event || alert.title}*`
      }
    }
  ];
  
  const fields = [];
  
  if (alert.severity) {
    fields.push({
      type: 'mrkdwn',
      text: `*Severity:* ${alert.severity}`
    });
  }
  
  if (alert.urgency) {
    fields.push({
      type: 'mrkdwn',
      text: `*Urgency:* ${alert.urgency}`
    });
  }
  
  if (alert.certainty) {
    fields.push({
      type: 'mrkdwn',
      text: `*Certainty:* ${alert.certainty}`
    });
  }
  
  if (alert.status) {
    fields.push({
      type: 'mrkdwn',
      text: `*Status:* ${alert.status}`
    });
  }
  
  if (fields.length > 0) {
    blocks.push({
      type: 'section',
      fields: fields
    });
  }
  
  if (alert.areaDesc) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Areas Affected:* ${alert.areaDesc}`
      }
    });
  }
  
  const summary = alert.summary || '';
  const truncatedSummary = summary.length > 200 
    ? summary.substring(0, 197) + '...' 
    : summary;
  
  if (truncatedSummary) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary:*\n${truncatedSummary}`
      }
    });
  }
  
  if (alert.effective || alert.expires) {
    const timeText = [];
    if (alert.effective) {
      timeText.push(`*Effective:* ${new Date(alert.effective).toLocaleString()}`);
    }
    if (alert.expires) {
      timeText.push(`*Expires:* ${new Date(alert.expires).toLocaleString()}`);
    }
    
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: timeText.join(' | ')
        }
      ]
    });
  }
  
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Full Details',
          emoji: true
        },
        value: alert.id || 'test_alert',
        action_id: 'view_alert_details',
        style: alert.severity === 'Extreme' ? 'danger' : 'primary'
      }
    ]
  });
  
  // Add a divider for visual separation
  blocks.push({
    type: 'divider'
  });
  
  return blocks;
}

module.exports = {
  formatAlertMessage,
  formatAlertBlocks,
  getSeverityColor,
  getUrgencyEmoji
};