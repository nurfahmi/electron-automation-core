'use strict';

const BrowserManager = require('./src/BrowserManager');
const ElectronPage = require('./src/ElectronPage');
const Mouse = require('./src/Mouse');
const Keyboard = require('./src/Keyboard');
const Network = require('./src/Network');
const Waiter = require('./src/Waiter');
const ProfileManager = require('./src/ProfileManager');
const GridManager = require('./src/GridManager');
const ElementHandle = require('./src/ElementHandle');
const Touch = require('./src/Touch');
const DialogHandler = require('./src/DialogHandler');
const DownloadManager = require('./src/DownloadManager');

module.exports = {
  BrowserManager,
  ElectronPage,
  Mouse,
  Keyboard,
  Network,
  Waiter,
  ProfileManager,
  GridManager,
  ElementHandle,
  Touch,
  DialogHandler,
  DownloadManager,
};
