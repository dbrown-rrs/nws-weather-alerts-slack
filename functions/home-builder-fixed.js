const { getSubscriptions } = require('./data-store');
const { getSeverityColor, getUrgencyEmoji } = require('./alert-formatter');
const { isAdmin } = require('../config/admins');

async function buildHomeView(userId) {
  const subscriptions = await getSubscriptions();
  const userIsAdmin = isAdmin(userId);
  
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🌦️ NWS Weather Alerts Manager',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Manage National Weather Service alert subscriptions for your Slack workspace.\n${userIsAdmin ? '👑 *Admin Access*' : '👀 *View Only*'}`
      }
    },
    {
      type: 'divider'
    }
  ];
  
  // Add subscriptions header with optional admin button
  const subscriptionsBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*📡 Active Feed Subscriptions*'
    }
  };
  
  if (userIsAdmin) {
    subscriptionsBlock.accessory = {
      type: 'button',
      text: {
        type: 'plain_text',
        text: '➕ Add Feed',
        emoji: true
      },
      action_id: 'add_feed',
      style: 'primary'
    };
  }
  
  blocks.push(subscriptionsBlock);
  
  if (subscriptions.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '_No feeds configured. Click "Add Feed" to get started._'
      }
    });
  } else {
    for (const sub of subscriptions) {
      const statusEmoji = sub.active ? '✅' : '⏸️';
      const statusText = sub.active ? 'Active' : 'Paused';
      
      const feedBlock = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${sub.name}*\n${statusEmoji} ${statusText}\n🔗 \`${sub.zone || sub.url}\``
        }
      };
      
      if (userIsAdmin) {
        feedBlock.accessory = {
          type: 'overflow',
          options: [
            {
              text: {
                type: 'plain_text',
                text: sub.active ? '⏸️ Pause' : '▶️ Resume',
                emoji: true
              },
              value: sub.id
            },
            {
              text: {
                type: 'plain_text',
                text: '🗑️ Remove',
                emoji: true
              },
              value: sub.id
            }
          ],
          action_id: 'feed_menu'
        };
      }
      
      blocks.push(feedBlock);
      
      if (sub.lastChecked) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Last checked: ${new Date(sub.lastChecked).toLocaleString()}`
            }
          ]
        });
      }
    }
  }
  
  blocks.push(
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📊 Statistics*'
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Feeds:*\n${subscriptions.length}`
        },
        {
          type: 'mrkdwn',
          text: `*Active Feeds:*\n${subscriptions.filter(s => s.active).length}`
        }
      ]
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Alerts are checked every 5 minutes and posted to <#${process.env.TARGET_CHANNEL_ID || 'C09BA83JGNS'}>`
        }
      ]
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔄 Refresh',
            emoji: true
          },
          action_id: 'refresh_home'
        }
      ]
    }
  );
  
  return {
    type: 'home',
    blocks: blocks
  };
}

function buildAlertDetailModal(data) {
  const alert = data.alert;
  const subscription = data.subscription;
  
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${alert.event || alert.title}*`
      }
    }
  ];
  
  if (alert.headline) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Headline:*\n${alert.headline}`
      }
    });
  }
  
  const details = [];
  if (alert.severity) details.push(`*Severity:* ${alert.severity}`);
  if (alert.urgency) details.push(`*Urgency:* ${alert.urgency}`);
  if (alert.certainty) details.push(`*Certainty:* ${alert.certainty}`);
  if (alert.status) details.push(`*Status:* ${alert.status}`);
  if (alert.msgType) details.push(`*Message Type:* ${alert.msgType}`);
  if (alert.category) details.push(`*Category:* ${alert.category}`);
  
  if (details.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: details.join('\n')
      }
    });
  }
  
  if (alert.areaDesc) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Areas Affected:*\n${alert.areaDesc}`
      }
    });
  }
  
  if (alert.summary) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary:*\n${alert.summary}`
      }
    });
  }
  
  if (alert.description) {
    const truncatedDesc = alert.description.length > 2000 
      ? alert.description.substring(0, 1997) + '...'
      : alert.description;
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Description:*\n${truncatedDesc}`
      }
    });
  }
  
  if (alert.instruction) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Instructions:*\n${alert.instruction}`
      }
    });
  }
  
  const timeInfo = [];
  if (alert.effective) timeInfo.push(`*Effective:* ${new Date(alert.effective).toLocaleString()}`);
  if (alert.onset) timeInfo.push(`*Onset:* ${new Date(alert.onset).toLocaleString()}`);
  if (alert.expires) timeInfo.push(`*Expires:* ${new Date(alert.expires).toLocaleString()}`);
  
  if (timeInfo.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: timeInfo.join('\n')
      }
    });
  }
  
  if (alert.link) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${alert.link}|View on NWS Website>`
      }
    });
  }
  
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Source: ${subscription.name} | Updated: ${new Date(alert.updated).toLocaleString()}`
      }
    ]
  });
  
  return {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: 'Weather Alert Details',
      emoji: true
    },
    close: {
      type: 'plain_text',
      text: 'Close',
      emoji: true
    },
    blocks: blocks
  };
}

function buildAddFeedModal() {
  return {
    type: 'modal',
    callback_id: 'add_feed_submission',
    title: {
      type: 'plain_text',
      text: 'Add Weather Feed',
      emoji: true
    },
    submit: {
      type: 'plain_text',
      text: 'Add Feed',
      emoji: true
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
      emoji: true
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Add a new NWS CAP ATOM feed to monitor for weather alerts.'
        }
      },
      {
        type: 'input',
        block_id: 'feed_url',
        element: {
          type: 'plain_text_input',
          action_id: 'url_input',
          placeholder: {
            type: 'plain_text',
            text: 'https://api.weather.gov/alerts/active.atom?zone=XXX'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Feed URL',
          emoji: true
        }
      },
      {
        type: 'input',
        block_id: 'feed_name',
        element: {
          type: 'plain_text_input',
          action_id: 'name_input',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., Northern New Jersey'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Feed Name',
          emoji: true
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Find zone codes at: https://www.weather.gov/pimar/PubZone'
          }
        ]
      }
    ]
  };
}

function buildEditFeedModal(subscription) {
  return {
    type: 'modal',
    callback_id: 'edit_feed_submission',
    private_metadata: subscription.id,
    title: {
      type: 'plain_text',
      text: 'Edit Feed',
      emoji: true
    },
    submit: {
      type: 'plain_text',
      text: 'Save Changes',
      emoji: true
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
      emoji: true
    },
    blocks: [
      {
        type: 'input',
        block_id: 'feed_name',
        element: {
          type: 'plain_text_input',
          action_id: 'name_input',
          initial_value: subscription.name
        },
        label: {
          type: 'plain_text',
          text: 'Feed Name',
          emoji: true
        }
      },
      {
        type: 'input',
        block_id: 'feed_url',
        element: {
          type: 'plain_text_input',
          action_id: 'url_input',
          initial_value: subscription.url
        },
        label: {
          type: 'plain_text',
          text: 'Feed URL',
          emoji: true
        }
      }
    ]
  };
}

module.exports = {
  buildHomeView,
  buildAlertDetailModal,
  buildAddFeedModal,
  buildEditFeedModal
};