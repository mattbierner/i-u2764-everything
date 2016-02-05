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

// Minimum number of unprocessed users to keep around at any given time.
const QUEUE_SIZE = 100;

// Maximum number of users to sample each time. May not be unique.
const BUFFER_SIZE = 50;

// Disable actual @mentions
const DEBUG = false;


const client = new Twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const db = new Datastore({ filename: DB_FILE, autoload: true });

/**
    Select a user from the database,
*/
const get_user_entry = (screenName, k) =>
    db.findOne({ _id: screenName }, k);

/**
    Try to add a user to the database if one does not already exist.
*/
const ensure_user_entry = (screenName) =>
    new Promise((resolve, reject) =>
        get_user_entry(screenName, (err, result) => {
            if (err)
                return reject(err);
            if (result !== null)
                return resolve(result);
            // Create new
            db.insert({ _id: screenName, messaged_at: 0 },
                (err, result) =>
                    err ? reject(err) : resolve(result));
        }));

/**
    Get users who are in database but have not been messaged yet.
*/
const get_unloved_user_entries = () =>
    new Promise((resolve, reject) =>
        db.find({ messaged_at: 0 },
            (err, result) => err ? reject(err) : resolve(result)));

/**
    Start filling in the user database using the sample stream.
*/
const populate_users = (k) =>
    client.stream('statuses/sample', {}, (stream) => {
        stream.on('data', tweet => {
            if (tweet && tweet.user && tweet.user.screen_name) {
                const screenName = tweet.user.screen_name;
                if (!k(screenName))
                    stream.destroy();
            }
        });

        stream.on('error', e => {
            console.error(e);
        });
    });

/**
    Try to make sure we have a good set of unloved users to pick from.
*/
const ensure_future_lovers = () =>
    get_unloved_user_entries()
        .then(users => {
            if (users.length > QUEUE_SIZE)
                return;

            return new Promise((resolve) => {
                let required = BUFFER_SIZE;
                populate_users(screenName => {
                    ensure_user_entry(screenName).catch(console.error);
                    if (required-- < 0) {
                        resolve();
                        return false;
                    }
                    return true; /* continue */
                });
            });
        });

/**
    Select a sad, lonely user who needs some love.
*/
const pick_user = () =>
    new Promise((resolve, reject) =>
        db.findOne({ messaged_at: 0 },
            (err, result) => {
                if (err)
                    return reject(err);
                if (!result)
                    return reject("nobody to share the love with :(");
                resolve(result._id);
            }));

/**
    Make sure not to share too much love by marking when a user has been messaged.
*/
const update_user = (screenName) =>
    return new Promise((resolve, reject) =>
        db.update({ _id: screenName },
            { $set: { messaged_at: Date.now() }},
            {},
            (err) => err ? reject(err) : resolve(screenName)));

/**
    Generate a personalized messsage of heartfelt love.
*/
const status_message = (user) =>
    (DEBUG ? user : '@' + user) + ', I \u{2764} you';

/**
    Post the love.
*/
const share_the_love = (screenName) =>
    new Promise((resolve, reject) =>
        client.post('statuses/update', { status: status_message(screenName) },
            (err, tweet, response) =>
                err ? reject(err) : resolve(screenName)));

/**
    Spread love to the world.
*/
const spread_the_love = () =>
    ensure_future_lovers().then(() =>
        pick_user()
            .then(share_the_love)
            .then(update_user)
            .then(screenName => {
                console.log('Shared the love with ' + screenName);
                setTimeout(spread_the_love, INTERVAL);
            })
            .catch((err) => {
                console.error(err);
                setTimeout(spread_the_love, INTERVAL);
            }));

spread_the_love();
