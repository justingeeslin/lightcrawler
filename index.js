const cheerio = require('cheerio')
const ChildProcess = require('child_process')
const Crawler = require('simplecrawler')
const path = require('path')
const queue = require('async/queue')
const fs = require('fs')
const colors = require('colors')
const extend = require('extend')

const stats = {
  pageCount: 0,
  violationCounts: {},
  passedAuditsCount: 0,
  startTime: null,
  auditTimesByPageUrl: {}
}

var configPathLighthouse;

module.exports = (options) => {
  stats.startTime = new Date()
  const configPath = path.resolve(options.config)
  const config = JSON.parse(fs.readFileSync(configPath))
  configPathLighthouse = path.resolve(options.lighthouseConfig)

  const crawler = new Crawler(options.url)

  var crawlerDefaults = {
    respectRobotsTxt: false,
    parseHTMLComments: false,
    parseScriptTags: false,
    maxDepth: 1
  }

  //Apply first defaults, second overriding defaults
  extend(crawler, crawlerDefaults, config.settings.crawler)

  crawler.discoverResources = (buffer, item) => {
    const page = cheerio.load(buffer.toString('utf8'))
    const links = page('a[href]').map(function () {
      return page(this).attr('href')
    }).get()

    return links
  }

  let totalErrorCount = 0

  const lighthouseQueue = queue((url, callback) => {
    runLighthouse(url, configPath, (errorCount) => {
      totalErrorCount += errorCount
      callback()
    })
  }, config.settings.crawler.maxChromeInstances)

  crawler.on('fetchcomplete', (queueItem, responseBuffer, response) => {
    lighthouseQueue.push(queueItem.url)
  })
  crawler.once('complete', () => {
    lighthouseQueue.drain = () => {
      if (totalErrorCount > 0) {
        process.exit(1)
      }
    }
  })

  crawler.start()
}

var resultIndex = 0;
function runLighthouse (url, configPath, callback) {

  const args = [
    url,
    '--output=json',
    '--output=html',
    '--output-path=./results-' + resultIndex++ + '.json',
    '--disable-device-emulation',
    '--disable-cpu-throttling',
    '--disable-network-throttling',
    '--chrome-flags=--headless --disable-gpu',
    `--config-path=${configPathLighthouse}`
  ]

  const lighthousePath = require.resolve('lighthouse/lighthouse-cli/index.js')
  const lighthouse = ChildProcess.spawn(lighthousePath, args)

  lighthouse.stdout.on('data', (data) => {
    console.log(`${data}`);
  });

  lighthouse.stderr.on('data', (data) => {
    console.error(`${data}`);
  });

  lighthouse.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
  });

}
