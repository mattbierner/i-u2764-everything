"use strict";
const path = require('path');
const fs = require('fs');
const Twitter = require('twitter');
const Datastore = require('nedb');

// Time between postings, in ms.
const INTERVAL = 1000 * 60 * 5; // five minutes.

// Database file location.
const DB_FILE = "data.db";
const DB_PATH = path.join(__dirname, DB_FILE);

// Minimum number of unprocessed tags to keep around at any given time.
const QUEUE_SIZE = 100;

// Maximum number of tags to sample each time. May not be unique.
const BUFFER_SIZE = 50;

// Disable actual postings
const DEBUG = true;

// Keep around in-memory cache to prevent getting stuck on a single item.
const CACHE_LIMIT = 10;

let temp_cache = [];

const add_cache = (x) => {
    temp_cache.unshift(x);
    // unduplicate
    temp_cache = temp_cache.filter((x, pos) => temp_cache.indexOf(x) === pos);
    while (temp_cache.length > CACHE_LIMIT)
        temp_cache.pop();
};


const client = new Twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const db = new Datastore({ filename: DB_FILE, autoload: true });

/**
    Select a tag from the database,
*/
const get_tag_entry = (tag, k) =>
    db.findOne({ tag: tag }, k);

/**
    Try to add a tag to the database if one does not already exist.
*/
const ensure_tag_entry = (tag) =>
    new Promise((resolve, reject) =>
        db.update({ tag: tag }, { $set: { tag: tag } }, { upsert: true },
            (err, result) =>
                err ? reject(err) : resolve(result)));

/**
    Get tags who are in database but have not been messaged yet.
*/
const get_unloved_tag_entries = () =>
    new Promise((resolve, reject) =>
        db.find({ messaged_at: { $exists: false } },
            (err, result) => err ? reject(err) : resolve(result)));

/**
    Start filling in the tag database using the sample stream.
*/
const populate_tags = (k) =>
    client.stream('statuses/sample', {}, (stream) => {
        stream.on('data', tweet => {
            if (tweet && tweet.entities && tweet.entities.hashtags) {
                for (let tag of tweet.entities.hashtags)
                    if (!k(tag.text))
                        stream.destroy();
            }
        });

        stream.on('error', e => {
            console.error('stream error', e);
        });
    });

/**
    Try to make sure we have a good set of unloved tags to pick from.
*/
const ensure_future_tags = () =>
    get_unloved_tag_entries()
        .then(tags => {
            if (tags.length > QUEUE_SIZE)
                return;

            return new Promise((resolve) => {
                let required = BUFFER_SIZE;
                populate_tags(tag => {
                    ensure_tag_entry(tag).catch(e => console.error('ensure error', e));
                    if (required-- < 0) {
                        resolve();
                        return false; /* done */
                    }
                    return true; /* continue */
                });
            });
        });

/**
    Select a tag who needs some love.
*/
const pick_tag = () =>
    new Promise((resolve, reject) =>
        db.findOne({ $and: [ { messaged_at: { $exists: false } }, { tag: { $nin: temp_cache } }] },
            (err, result) => {
                if (err)
                    return reject(err);
                if (!result)
                    return reject("nothing to share the love with :(");
                resolve(result.tag);
            }));

/**
    Make sure not to share too much love by marking when a tag has been messaged.
*/
const update_tag = (tag) =>
    new Promise((resolve, reject) =>
        db.update({ tag: tag },
            { $set: { messaged_at: Date.now() }},
            {},
            (err) => err ? reject(err) : resolve(tag)));

/**
    Generate an expression of boundless love.
*/
const status_message = (tag) =>
    'I \u{2764} #' + tag;

/**
    Post the love.
*/
const share_the_love = (tag) => {
    add_cache(tag);

    return new Promise((resolve, reject) =>
        DEBUG ? resolve(tag) :
        client.post('statuses/update', { status: status_message(tag) },
            (err, tweet, response) =>
                err ? reject(err) : resolve(tag)));
};

/**
    Spread love to the world.
*/
const spread_the_love = () =>
    ensure_future_tags().then(pick_tag).then(tag =>
        share_the_love(tag)
            .then(update_tag)
            .then(tag => {
                console.log('Shared the love with ' + tag);
                setTimeout(spread_the_love, INTERVAL);
            })
            .catch(err => {
                console.error('post error', err);
                if (err && err[0] && err[0].code === 187) {
                    console.error('Duplicate detected by Twitter, added entry to cache and will retry', tag);
                    setTimeout(spread_the_love, 250);
                    return;
                } else {
                    setTimeout(spread_the_love, INTERVAL);
                }
            }))
    .catch(err => {
        console.error('pick error', err);
    });

db.ensureIndex({ fieldName: 'tag' }, err => {
    if (err) {
        console.error('index error', err);
        return;
    }
    spread_the_love();
});
