// googleCalendar.js
const { google } = require('googleapis');
const path = require('path');

// 1) Path to your service account key JSON
const KEYFILEPATH = path.join(__dirname, 'credentials', 'clubtattoo-sheets-integration-dc816ba2a0d9.json');

// 2) The Calendar ID (from your Google Calendar settings)
const CALENDAR_ID = '923f47b5d061d96f102e6fdced3bd83ec55922a0f791d135e6e06a52b1730329@group.calendar.google.com'; 
// If it's a private calendar under your account, the ID is often your gmail address or 
// a custom domain address. You can also see it in Calendar Settings.

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

// Example function: Create a new event
async function createEvent({ summary, description, startTime, endTime }) {
  const client = await auth.getClient();
  const calendar = google.calendar({ version: 'v3', auth: client });

  // Build the event object
  const event = {
    summary,       // e.g., "Tattoo Appointment with Tony"
    description,   // e.g., "Full sleeve design"
    start: { dateTime: startTime },  // e.g., "2025-03-10T14:00:00-07:00"
    end: { dateTime: endTime },      // e.g., "2025-03-10T16:00:00-07:00"
  };

  const response = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: event,
  });

  return response.data; // returns the created event object
}

// Example function: List upcoming events
async function listEvents() {
  const client = await auth.getClient();
  const calendar = google.calendar({ version: 'v3', auth: client });

  const now = new Date().toISOString();
  const response = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: now,            // only future events
    maxResults: 10,          // how many to fetch
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items; // array of event objects
}

module.exports = {
  createEvent,
  listEvents,
};
