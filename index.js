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

    const lastOne = hrefs
        .filter((x) => x.startsWith(major))
        .map((str) => ({ str, date: /(\d\d\d\d\d\d\d\d)/.exec(str)[0] }))
        .map(({ str, date }) => {

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

    console.log(lastOne)


};

main(V10);

