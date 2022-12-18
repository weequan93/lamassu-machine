// for now, make this b/w compat with trader.js calls

const got = require('got')
const uuid = require('uuid')
const crypto = require('crypto');
const argv = require('minimist')(process.argv.slice(2))

const PORT = 9999 || 443
const RETRY_INTERVAL = 5000
const RETRY_TIMEOUT = 150000

function retrier (timeout) {
  const maxRetries = timeout / RETRY_INTERVAL

  return (retry, err) => {
    if (err.statusCode && err.statusCode === 403) return 0
    if (retry >= maxRetries) return 0

    return RETRY_INTERVAL
  }
}

function request (configVersion, globalOptions, options) {
  const start = Date.now()
  const protocol = globalOptions.protocol
  const connectionInfo = globalOptions.connectionInfo
  if (!connectionInfo) return Promise.resolve()
  const host = protocol === 'http:' ? 'localhost' : connectionInfo.atmhost
  const signTool = SignTool(connectionInfo["SAAS-PPK"])
  const requestId = uuid.v4()
  const date = new Date().toISOString()
  const headers = { "idempotentTimeStamp": Math.floor(Date.now() / 1000) }
  if (options.body) headers['content-type'] = 'application/json'
  //if (configVersion) headers['config-version'] = configVersion
  if (connectionInfo["ATM-Number"]) headers['ATM-Number'] = connectionInfo["ATM-Number"]
  if (globalOptions.token) headers['Authorization'] = globalOptions.token
  const repeatUntilSuccess = !options.noRetry
  const retryTimeout = options.retryTimeout || RETRY_TIMEOUT

  const retries = repeatUntilSuccess
    ? retrier(retryTimeout)
    : null

  // sign
  // console.debug("options qs", options.qs, "options body", options.body)
  if (options.qs){
    headers.SIGNATURE = signTool.Sign(options.qs)
  } else if (options.body){
    headers.SIGNATURE = signTool.Sign(JSON.stringify(options.body))
  }

  if (options.qs){
    options.path += `?${options.qs}`
  }
  // console.debug("======= request header=", JSON.stringify(headers),"path=", options.path )
  const gotOptions = {
    protocol,
    host,
    port: PORT,
    agent: false,
    //cert: globalOptions.clientCert.cert,
    //key: globalOptions.clientCert.key,
    //ca: connectionInfo.ca,
    rejectUnauthorized: false,
    method: options.method,
    path: options.path,
    body: options.body,
    retries,
    timeout: 20000,
    headers,
    json: true
  }

  return got(options.path, gotOptions).then((r)=>{
    const stop = Date.now()
    // console.debug(`Time Taken to execute = ${(stop - start) / 1000} seconds request = ${options.path}`);
    return r
  }).catch((err)=>{
    const stop = Date.now()
    // console.debug(`Time Taken to execute = ${(stop - start) / 1000} seconds request = ${options.path}`);
    if(err.response && err.response.body){
      console.error("=== got with response ", err.response.body )
    }else{
      console.error("=== got else", err )
    }
   
    throw err;
  })
}

const SignTool = (key) => {
  return {
    Sign: (data) => {
      const sign = crypto.createSign('md5WithRSAEncryption');
      sign.update(data, 'utf8');
      sign.end();
      try{
        let signature = sign.sign(key, 'base64');
        return signature;
      }catch(e){
        console.err("SignTool",e)
      }
     
    }
  }
}

module.exports = {request}
