/******************************************************
 * googleCalendar.js
 * Reads your Calendar JSON credentials from process.env.GOOGLE_CALENDAR_KEY
 ******************************************************/

const { google } = require('googleapis');

// 1) Parse the JSON from the environment variable
//    Make sure you set GOOGLE_CALENDAR_KEY in your hosting platform
const calendarCredentials = JSON.parse(process.env.GOOGLE_CALENDAR_KEY);

// 2) The Calendar ID from "Integrate calendar" in Google Calendar settings
//    Might look like "myname@gmail.com" or "abc123@group.calendar.google.com"
const CALENDAR_ID = 'YOUR_CALENDAR_ID_HERE';

// 3) Create a GoogleAuth instance with credentials
const auth = new google.auth.GoogleAuth({
  credentials: {
    private_key: calendarCredentials.private_key,
    client_email: calendarCredentials.client_email,
  },
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

// Example function: create a new event
async function createEvent({ summary, description, startTime, endTime }) {
  const client = await auth.getClient();
  const calendar = google.calendar({ version: 'v3', auth: client });

  // Build the event object
  const event = {
    summary,       // e.g. "Tattoo Appointment with Tony"
    description,   // e.g. "Full sleeve design"
    start: { dateTime: startTime },  // "2025-03-10T14:00:00-07:00"
    end: { dateTime: endTime },      // "2025-03-10T16:00:00-07:00"
  };

  const response = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: event,
  });

  return response.data; // returns the created event object
}

// Example function: list upcoming events
async function listEvents() {
  const client = await auth.getClient();
  const calendar = google.calendar({ version: 'v3', auth: client });

  // Filter for future events
  const now = new Date().toISOString();
  const response = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: now,
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items; // array of event objects
}

module.exports = {
  createEvent,
  listEvents,
};
