'use strict';
const CP = require('child_process'); // we will use it to no give docker credentials to node when publishing images
const Wreck = require('wreck');
const Cheerio = require('cheerio');
const Docker = require('dockerode');
const Semver  = require('semver');

const MIN_MAJOR = 10;
const URL_NIGHTLY = 'https://nodejs.org/download/nightly/';
const URL_V8_CANARY = 'https://nodejs.org/download/v8-canary/';
const URL_RC = 'https://nodejs.org/download/rc/';

const docker = new Docker();

const getLinks = function (page) {

    const $ = Cheerio.load(page);
    const links = $('a');
    const hrefs = [];
    $(links).each(function(i, link){

        hrefs.push($(link).attr('href'));
    });
    return hrefs;
};

const getLinkList = async function (url) {

    const res = await Wreck.get(url);
    const page = res.payload.toString();
    return getLinks(page);
};

const getMajors = function (list) {

    const RE = /^v(\d+)/;
    const majors = list
        .map((x) => x.match(RE))
        .filter(Boolean) // removes null
        .map(([_, match]) => parseInt(match));
    return Array.from(new Set(majors));
};

const getLastRCForMajor = function (list, major, baseURL) {

    const { str } = list
        .filter((x) => x.startsWith('v' + major))
        .map((str) => ({
            str,
            rc: parseInt(/rc\.(\d+)/.exec(str)[1]),
            version: str.slice(0, -1)
        }))
        .sort((a, b) => Semver.rcompare(a.version, b.version))[0];
    return baseURL + str + 'node-' + str.slice(0, -1) + '-linux-x64.tar.gz'
};

const getLastForMajor = function (list, major, baseURL) {

    const { str } = list
        .filter((x) => x.startsWith('v' + major))
        .map((str) => ({str, date: /(\d\d\d\d\d\d\d\d)/.exec(str)[0]}))
        .map(({str, date}) => {

            const year = date.slice(0, 4);
            const month = date.slice(4, 6);
            const day = date.slice(6, 8);
            return {
                str,
                raw: date,
                date: new Date(`${year}-${month}-${day}`)
            };
        })
        .sort((a, b) => a.date - b.date)
        .pop();
    return baseURL + str + 'node-' + str.slice(0, -1) + '-linux-x64.tar.gz'
};

const buildImage = async function (url, tag, kind) {

    console.log('BUILDING', kind, `tag ${tag} (${url})`);
    const stream = await docker.buildImage({
        context: __dirname,
        src: ['Dockerfile']
    }, {
        t: tag,
        buildargs: {
            DL_LINK: url
        }
    });
    await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
    });
};

const buildRC = async function () {

    const list = await getLinkList(URL_RC);
    const majors = getMajors(list)
        .filter((x) => x >= MIN_MAJOR);

    const tags = [];
    const links = majors.map((major) => ({ major, url: getLastRCForMajor(list, major, URL_RC) }));
    for (const { major, url } of links) {
        const tag = `vdeturckheim/node_nightly:v${major}-rc`;
        await buildImage(url, tag, 'RC');
        tags.push(tag);
    }
    return tags;
};

const buildNightly = async function () {

    const list = await getLinkList(URL_NIGHTLY);
    const majors = getMajors(list)
        .filter((x) => x >= MIN_MAJOR);

    const tags = [];
    const links = majors.map((major) => ({ url: getLastForMajor(list, major, URL_NIGHTLY), major }));
    for (const { major, url } of links) {
        const tag = `vdeturckheim/node_nightly:v${major}`;
        await buildImage(url, tag, 'NIGHTLY');
        tags.push(tag);
    }
    return tags;
};

const buildV8Canary = async function() {

    const list  = await getLinkList(URL_V8_CANARY);
    const lastMajor = Math.max(...getMajors(list));
    const url = getLastForMajor(list, lastMajor, URL_V8_CANARY);
    const tag = `vdeturckheim/node_nightly:v${lastMajor}-v8-canary`;
    await buildImage(url, tag, 'V8-CANARY');
    return tag;
};

const publish = function (tag) {

    console.log('docker push ' + tag);
    const cp = CP.spawn('docker', ['push', tag], { shell: true });
    cp.stderr.pipe(process.stderr);
    return new Promise((resolve, reject) => {

        cp.on('exit', (code) => code === 0 ? resolve() : reject());
    });
};

const main = async function () {

    // doing this one first to cache base image
    const canary = await buildV8Canary();

    const [nightly, rc] = await Promise.all([buildNightly(), buildRC()]);

    const tagList = [canary].concat(nightly).concat(rc);
    for (const tag of tagList) {
        await publish(tag);
        console.log('PUBLISHED', tag);
    }
};

main()
    .catch((e) => {

        console.error(e);
        process.exit(1);
    });
