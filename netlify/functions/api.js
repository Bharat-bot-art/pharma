const serverless = require('serverless-http');
const { createApp } = require('../../src/app');
const path = require('path');
require('ejs');
try { require('@libsql/linux-x64-gnu'); } catch (e) {}

const app = createApp();

module.exports.handler = serverless(app);
