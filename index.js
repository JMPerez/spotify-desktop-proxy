var electron = require('electron');
// Module to control application life.
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var SpotifyWebApi = require('spotify-web-api-node');
var WebApiRequest = require('spotify-web-api-node/src/webapi-request');
var HttpManager = require('spotify-web-api-node/src/http-manager');

var Menu = electron.Menu;

/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

var spotifyApi = new SpotifyWebApi({
  clientId : 'bb200fb215c346448b3c34bbccaac25d',
  clientSecret : '0902db0eb5274d4a8f3ec07d3d00d2c8',
  redirectUri : 'http://localhost:8888/callback'
});

var tokenExpirationEpoch = null;

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

function init() {
  var expressApp = express();

  expressApp.use(express.static(__dirname + '/public'))
     .use(cookieParser());

  expressApp.get('/login', function(req, res) {

    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    var scopes = ['user-read-private', 'user-read-email', 'user-follow-read', 'playlist-read-private', 'user-library-read', 'user-top-read'];
    res.redirect(spotifyApi.createAuthorizeURL(scopes, state));
  });

  expressApp.get('/callback', function(req, res) {

    // your application requests refresh and access tokens
    // after checking the state parameter

    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
      res.redirect('/#' +
        querystring.stringify({
          error: 'state_mismatch'
        }));
    } else {
      res.clearCookie(stateKey);
      spotifyApi.authorizationCodeGrant(code)
        .then(function(data) {
          // Set the access token on the API object to use it in later calls
          spotifyApi.setAccessToken(data.body['access_token']);
          spotifyApi.setRefreshToken(data.body['refresh_token']);

          tokenExpirationEpoch = new Date().getTime() + data.body['expires_in'] * 1000;

          res.redirect('/#' +
            querystring.stringify({
              access_token: spotifyApi.getAccessToken(),
              refresh_token: spotifyApi.getRefreshToken()
            }));
        })
        .catch(function(error) {
          res.redirect('/#' +
            querystring.stringify({
              error: 'invalid_token'
            }));
        });
      }
  });

  expressApp.get('/proxy', function(req, res) {

    if (tokenExpirationEpoch < new Date()) {
      spotifyApi.refreshAccessToken()
        .then(function(data) {
          // Set the access token on the API object to use it in later calls
          spotifyApi.setAccessToken(data.body['access_token']);
          spotifyApi.setRefreshToken(data.body['refresh_token']);
          makeRequest();
        });
    } else {
      makeRequest();
    }

    function makeRequest() {
      var request = WebApiRequest.builder()
        .withPath('/v1/' + req.query.url)
        .build();

      request.addHeaders({
        'Authorization' : 'Bearer ' + spotifyApi.getAccessToken()
      });

      HttpManager.get(request, function(error, result) {
        if (error) {
          res.json({error: 'error ' + JSON.stringify(error) +  'https://api.spotify.com/v1/' + req.query.url + ' ' + spotifyApi.getAccessToken()});
        } else {
          res.json(result.body);
        }
      });
    }
  });

  console.log('Listening on 8888');
  expressApp.listen(8888);
}

app.on('ready', function() {
  init();
  mainWindow = new BrowserWindow({
    width: 600,
    height: 600,
    autoHideMenuBar: true,
    useContentSize: true,
    resizable: false,
  });

  var template = [{
      label: "Application",
      submenu: [
          { label: "About Application", selector: "orderFrontStandardAboutPanel:" },
          { type: "separator" },
          { label: "Quit", accelerator: "Command+Q", click: function() { app.quit(); }}
      ]}, {
      label: "Edit",
      submenu: [
          { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
          { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
          { type: "separator" },
          { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
          { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
          { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
          { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
      ]}
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  mainWindow.loadURL('http://localhost:8888/');
  mainWindow.focus();

});
