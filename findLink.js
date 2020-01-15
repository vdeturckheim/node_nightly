'use strict';
const Wreck = require('wreck');
const Cheerio = require('cheerio');

const URLS = {
    nightly: 'https://nodejs.org/download/nightly/',
    'v8-canary': 'https://nodejs.org/download/v8-canary/'
};

const getLinks = function (page) {

    const $ = Cheerio.load(page);
    const links = $('a');
    const hrefs = [];
    $(links).each(function(i, link){

        hrefs.push($(link).attr('href'));
    });
    return hrefs;
};

const main = async function (type, major) {

    const MAIN_URL = URLS[type];
    const res = await Wreck.get(MAIN_URL);
    const page = res.payload.toString();
    const hrefs = getLinks(page);

    const lastOne = hrefs
        .filter((x) => x.startsWith(major))
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

    console.log(MAIN_URL + lastOne.str + 'node-' + lastOne.str.slice(0, -1) + '-linux-x64.tar.gz');
};

const args = process.argv.slice(-2);
const version = args.pop();
const type = args.pop();

main(type, version);

