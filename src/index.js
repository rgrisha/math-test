
const {google} = require('googleapis');
const path = require("path");
const rfr = require("rfr");
const settings = rfr( "config/config.json");
const credentials = rfr( "config/credentials.json");
const moment = require("moment");
const fs = require("fs");
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
let tokenFile = path.resolve(__dirname, "..", "config/token.json");


async function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  return new Promise((resolve, reject) => {
    // Check if we have previously stored a token.
    fs.readFile(tokenFile, (err, token) => {
      if (err) return getNewToken(oAuth2Client);
      oAuth2Client.setCredentials(JSON.parse(token));
      resolve(oAuth2Client);
    }); 
  });
}

async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);

  return new Promise((resolve, reject) => {
    readline.question('Enter the code from that page here: ', (code) => {
      readline.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          reject('Error while trying to retrieve access token' + err);
        } else {
          oAuth2Client.setCredentials(token);
          // Store the token to disk for later program executions
          fs.writeFile(tokenFile, JSON.stringify(token), (err) => {
            if (err) reject(err);
            console.log('Token stored to', tokenFile);
          });
          resolve(oAuth2Client);
        }
      });
    });
  });
}

async function callSpreadsheetService(auth, settings, sheets, range, values) {

  let request = {
    spreadsheetId: settings.spreadSheetKey,
    range,
    auth,
    valueInputOption: 'USER_ENTERED', 
    insertDataOption: 'INSERT_ROWS'
  };

  request.resource = {values};

  return new Promise((resolve, reject) => {
    sheets.spreadsheets.values.append(request, (err, response) => {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}

async function writeStat(auth, settings, sheets, result) {

  let stat = [
    result.begin,
    result.end,
    result.tasks.reduce((a,v) => {return v === "OK" ? a + 1 : a;}, 0),
    result.tasks.reduce((a,v) => {return v !== "OK" ? a + 1 : a;}, 0)
  ];

  let detail = result.tasks.map((t) => [t.begin, t.end, t.question, t.answer, t.status]);

  return Promise.all([
    callSpreadsheetService(auth, settings, sheets, "STAT!A1:D1", [stat]),
    callSpreadsheetService(auth, settings, sheets, "DETAIL!A1:E1", detail)
  ]);

}

function newResult() {
  return {
    begin: moment().format(),
    tasks: []
  };
}

function createTask() {
  const tasks = [
    function() {
      let a = Math.floor(Math.random() * 1000);
      let b = Math.floor(Math.random() * 1000);
      return { 
        question: a + "+" + b + "=",
        answer: a+b
      }
    },
    function() {
      let a = Math.floor(Math.random() * 900) + 100;
      let b = Math.floor(Math.random() * a);
      return { 
        question: a + "-" + b + "=",
        answer: a-b
      }
    }
  ];
  return tasks[Math.floor(Math.random() * 1000) % 2]();
}

async function runTask(ith, task) {
  return new Promise((resolve, reject) => {
    console.log(ith + ". " + task.question);
    readline.on('line', function(line){
      resolve(line);
    });
  });
}

async function runTasks() {

  const auth = await authorize(credentials);
  const sheets = google.sheets({version: 'v4', auth});

  let result = newResult();
  for(i = 1; i <= 10; i++) {
    let task = createTask();
    let begin = moment().format();
    let answer = await runTask(i, task);
    let answerObj ={begin: moment().format(), question: task.question, answer, status: "OK", end: moment().format()};
    if(parseInt(answer, "10") !== task.answer) {
      answerObj.status = "Error";
    }
    result.tasks.push(answerObj);
  }
  result.end = moment().format();
  return writeStat(auth, settings, sheets, result);
}

function main() {
  runTasks()
    .then(() => {
      console.log("Ačiū, pabaiga!");
      process.exit();
    })
    .catch((err) => {
      console.log("Klaida: ", err);
      process.exit();
    });
}

main();
