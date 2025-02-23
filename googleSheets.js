/******************************************************
 * googleSheets.js
 * Reads your Sheets JSON credentials from process.env.GOOGLE_SHEETS_KEY
 ******************************************************/

const { google } = require('googleapis');

// 1) Replace with your actual Spreadsheet ID (from the URL in Google Sheets)
const SPREADSHEET_ID = '1oHtyupf7EGYiCzavUHf_jlMNZ13_cWb2GLVMkKyPnSI';

// 2) Parse the JSON from the environment variable
//    Make sure you set GOOGLE_SHEETS_KEY in Render or wherever you're hosting
const sheetsCredentials = JSON.parse(process.env.GOOGLE_SHEETS_KEY);

// 3) Create a GoogleAuth instance with credentials instead of keyFile
const auth = new google.auth.GoogleAuth({
  credentials: {
    private_key: sheetsCredentials.private_key,
    client_email: sheetsCredentials.client_email,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Example function: read data from the "Artists" tab
async function getArtistsData() {
  // Get an authorized client
  const client = await auth.getClient();
  // Create a Sheets instance
  const sheets = google.sheets({ version: 'v4', auth: client });

  // Example range: "Artists!A1:E"
  // Adjust based on your actual sheet name & columns
  const range = 'Artists!A1:E';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  // Skip the header row
  const dataRows = rows.slice(1);

  // Convert each row to an object
  const artists = dataRows.map((row) => ({
    name: row[0],
    specialty: row[1],
    location: row[2],
    schedule: row[3],
    notes: row[4],
  }));

  return artists;
}

module.exports = {
  getArtistsData,
};
