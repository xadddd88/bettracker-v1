'use strict'

const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const tls = require('node:tls')

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

function normalizeHost(host) {
  return String(host ?? '').replace(/^\[|\]$/g, '').toLowerCase()
}

function assertLoopback(host, source) {
  const normalized = normalizeHost(host)
  if (!normalized || LOOPBACK_HOSTS.has(normalized)) return
  throw new Error(`[web-acceptance] blocked non-loopback ${source} request to ${normalized}`)
}

function requestHost(input, options) {
  let host = null
  if (typeof input === 'string' || input instanceof URL) {
    try { host = new URL(input).hostname } catch {}
  } else if (input && typeof input === 'object') {
    host = input.hostname ?? input.host ?? null
  }
  if (options && typeof options === 'object') {
    host = options.hostname ?? options.host ?? host
  }
  return host
}

function guardRequest(original, source) {
  return function guardedRequest(input, options, ...rest) {
    assertLoopback(requestHost(input, options), source)
    return original.call(this, input, options, ...rest)
  }
}

http.request = guardRequest(http.request, 'http')
http.get = guardRequest(http.get, 'http')
https.request = guardRequest(https.request, 'https')
https.get = guardRequest(https.get, 'https')

const originalNetConnect = net.connect
net.connect = function guardedNetConnect(input, host, ...rest) {
  if (typeof input === 'number') assertLoopback(typeof host === 'string' ? host : 'localhost', 'tcp')
  else if (input && typeof input === 'object' && 'port' in input) assertLoopback(input.host ?? 'localhost', 'tcp')
  return originalNetConnect.call(this, input, host, ...rest)
}
net.createConnection = net.connect

const originalTlsConnect = tls.connect
tls.connect = function guardedTlsConnect(input, ...rest) {
  if (typeof input === 'number') assertLoopback(typeof rest[0] === 'string' ? rest[0] : 'localhost', 'tls')
  else if (input && typeof input === 'object') assertLoopback(input.host ?? input.servername ?? 'localhost', 'tls')
  return originalTlsConnect.call(this, input, ...rest)
}

if (globalThis.fetch) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = function guardedFetch(input, init) {
    const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
    assertLoopback(url.hostname, 'fetch')
    return originalFetch(input, init)
  }
}
