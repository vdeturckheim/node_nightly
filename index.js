'use strict';
const CP = require('child_process');
const Fs = require('fs');
const Util = require('util');

const Wreck = require('wreck');
const Cheerio = require('cheerio');


const MAIN_URL = 'https://nodejs.org/download/nightly/';
const RE = /href="(.*)"/gm;

const V10 = 'v10';
const V12 = 'v12';

const main = async function (major) {

    const res = await Wreck.get(MAIN_URL);
    const page = res.payload.toString();
    const $ = Cheerio.load(page);
    const links = $('a');
    const hrefs = [];
    $(links).each(function(i, link){

        hrefs.push($(link).attr('href'));
    });

    const linkList = hrefs
        .filter((x) => x.startsWith(major))
        .map((str) => ({ str, end: str.split('_').pop() }))
        .sort((a, b) => a.end - b.end)
        .map((x) => x.str);


    console.log(JSON.stringify(linkList, null, 2))
};

main(V10);

