'use strict';
const CP = require('child_process'); // we will use it to no give docker credentials to node when publishing images
const Stream = require('stream');
const Wreck = require('wreck');
const Cheerio = require('cheerio');
const Docker = require('dockerode');

const MIN_NIGHTlY_MAJOR = 11;
const URL_NIGHTLY = 'https://nodejs.org/download/nightly/';
const URL_V8_CANARY = 'https://nodejs.org/download/v8-canary/';

const LogTransform = class extends Stream.Transform {

    _transform(chunk, enc, cb) {

        const str = chunk.toString().trim();
        try {
            const { stream } = JSON.parse(str);
            this.push(stream);
            cb();
        }
        catch (_) {
            return cb();
        }

    }
};

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

const buildImage = async function (url, tag) {

    console.log('BUILDING', 'NIGHTLY', `tag ${tag} (${url})`);
    const stream = await docker.buildImage({
        context: __dirname,
        src: ['Dockerfile']
    }, {
        t: tag,
        buildargs: {
            DL_LINK: url
        }
    });
    stream
        .pipe(new LogTransform())
        .pipe(process.stdout);
    await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
    });
};

const buildNightly = async function () {

    const list = await getLinkList(URL_NIGHTLY);
    const majors = getMajors(list)
        .filter((x) => x >= MIN_NIGHTlY_MAJOR);
    const max = Math.max(...majors);

    const tags = [];
    const links = majors.map((major) => ({ url: getLastForMajor(list, major, URL_NIGHTLY), major }));
    for (const { major, url } of links) {
        const tag = `vdeturckheim/node_nightly:v${major}`;
        await buildImage(url, tag);
        tags.push(tag);
        if (major === max) {
            await buildImage(url, 'latest');
            tags.push('latest');
        }
    }
    return tags;
};

const buildV8Canary = async function() {

    const list  = await getLinkList(URL_V8_CANARY);
    const lastMajor = Math.max(...getMajors(list));
    const url = getLastForMajor(list, lastMajor, URL_V8_CANARY);
    const tag = `vdeturckheim/node_nightly:v${lastMajor}-v8-canary`;
    await buildImage(url, tag);
    return tag;
};

const publish = function (tag) {

    const cp = CP.spawn('docker', ['push', tag], { shell: true });
    cp.stderr.pipe(process.stderr);
    cp.stdout.pipe(process.stdout);
    return new Promise((resolve, reject) => {

        cp.on('exit', (code) => code === 0 ? resolve() : reject());
    });
};

const main = async function () {

    const tagList = await buildNightly();
    const canary = await buildV8Canary();
    tagList.push(canary);
    for (const tag of tagList) {
        await publish(tag);
    }
};

main()
    .catch((e) => {

        console.error(e);
        process.exit(1);
    });
