const serverless = require('serverless-http');
const { createApp } = require('../../src/app');
const path = require('path');
require('ejs');

const app = createApp();

module.exports.handler = serverless(app);
