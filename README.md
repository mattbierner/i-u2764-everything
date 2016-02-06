# I U+2764 Everything
Fork of [I u2764 everyone](https://github.com/mattbierner/i-u2764-everyone) that sends messages of love to hashtags instead of people using Twitter.

After @_LovedArt was banned for sending Twitter users love directly, I still lots of love to share. The ban made it clear that I should love things instead of people, which is why I created this bot and [@_lovedHArt][_lovedhart] to continue my work.

[See the bot in action over @_lovedHArt][_lovedhart]

# Running
To love yourself some hashtags, first [register an application with Twitter](http://dev.twitter.com).

The main script for the bot lives in `index.js` and uses [Node][node].

```bash
$ cd i_u2764_everything
$ npm install
```

Make sure to set the following environment variables using your fancy new registered Twitter application:

```bash
$ export TWITTER_CONSUMER_KEY="your app key"
$ export TWITTER_CONSUMER_SECRET="your app secret"
$ export TWITTER_ACCESS_TOKEN_KEY="your access token key"
$ export TWITTER_ACCESS_TOKEN_SECRET="your access token secret"
```

Then just run the script, `$ node index.js`. A database of tags that tracks what has been loved so far is saved to `data.db.

Run the script using [forever][forever], `$ forever start index.js`, so the #love never has to stop.


[forever]: https://github.com/foreverjs/forever
[node]: https://nodejs.org/
[_lovedart]: https://twitter.com/_lovedart
[_lovedhart]: https://twitter.com/_lovedhart
