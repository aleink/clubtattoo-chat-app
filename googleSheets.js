// googleSheets.js
const { google } = require('googleapis');
const path = require('path');

// 1) Path to your JSON key file
const KEYFILEPATH = path.join(__dirname, 'credentials', 'clubtattoo-sheets-integration-409fbe2294dc.json');


// 2) The ID of your spreadsheet (from the URL)
const SPREADSHEET_ID = '1oHtyupf7EGYiCzavUHf_jlMNZ13_cWb2GLVMkKyPnSI'; // Replace with yours

// 3) Initialize auth
const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// 4) Fetch artists from the "Artists" sheet
async function getArtistsData() {
  // Create a client
  const client = await auth.getClient();
  // Create a Google Sheets instance
  const sheets = google.sheets({ version: 'v4', auth: client });

  // Range: e.g. "Artists!A1:E" if you have columns A-E
  const range = 'Artists!A1:E';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  // First row might be headers: "Name", "Specialty", etc.
  const header = rows[0];
  const dataRows = rows.slice(1); // skip the header row

  // Convert each row to an object
  const artists = dataRows.map((row) => {
    return {
      name: row[0],
      specialty: row[1],
      location: row[2],
      schedule: row[3],
      notes: row[4],
    };
  });

  return artists;
}

module.exports = {
  getArtistsData,
};
