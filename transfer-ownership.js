const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// Define the scopes required for Drive operations
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file'
];

// Paths for credential storage
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// Load saved credentials if they exist
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

// Save credentials for future use
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

// Authorize with Google
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

// Get permission ID for a specific user on a file
async function getPermissionId(drive, fileId, userEmail) {
  const response = await drive.permissions.list({
    fileId: fileId,
    fields: 'permissions(id, emailAddress)',
  });
  
  const permission = response.data.permissions.find(
    permission => permission.emailAddress === userEmail
  );
  
  if (!permission) {
    throw new Error(`User ${userEmail} does not have access to this file`);
  }
  
  return permission.id;
}

// Transfer ownership of a file
async function transferOwnership(auth, fileId, newOwnerEmail) {
  const drive = google.drive({version: 'v3', auth});
  
  try {
    console.log(`Starting ownership transfer of file ${fileId} to ${newOwnerEmail}...`);
    
    // First, ensure the new owner has access to the file
    console.log('Granting access to the new owner...');
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'writer',  // Must be 'writer' before changing to 'owner'
        type: 'user',
        emailAddress: newOwnerEmail,
        pendingOwner: true,
      },
      
    });
    
    console.log('Access granted. Getting permission ID...');
    // Get the permission ID for the new owner
    const permissionId = await getPermissionId(drive, fileId, newOwnerEmail);
    
    console.log(`Permission ID found: ${permissionId}. Transferring ownership...`);
    // Now transfer ownership
    const response = await drive.permissions.update({
      fileId: fileId,
      permissionId: permissionId,
      supportsAllDrives: true,
      supportsTeamDrives: true,
      transferOwnership: true,
      requestBody: {
        role: 'owner',
      },
    });
    
    console.log(`Ownership transferred to ${newOwnerEmail} successfully!`);
    return response.data;
  } catch (error) {
    console.error('Error transferring ownership:', error.message);
    throw error;
  }
}

// Main function
async function main() {
  // Replace these values with your actual file ID and new owner email
  const fileId = '323snjfaoiajoiseaiD';
  
  const newOwnerEmail = 'jeromenospecialcharacter@gmail.com';
//   const newOwnerEmail = 'lacsamana.jerome@gmail.com';
  try {
    console.log('Authorizing with Google...');
    const auth = await authorize();
    console.log('Authorization successful. Proceeding with transfer...');
    await transferOwnership(auth, fileId, newOwnerEmail);
  } catch (error) {
    console.error('Error in main function:', error.message);
  }
  
}

// Run the program
main();