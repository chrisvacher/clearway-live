import type { MetadataRoute } from "next";

// Search engines stay out (the layout also says noindex). Link-preview bots may read pages,
// so a live.clearway.co link posted to LinkedIn, X, Facebook, Slack or a message shows the
// share image (app/opengraph-image.png) and title rather than a bare link.
const previewBots = [
  "facebookexternalhit", "Facebot", "LinkedInBot", "Twitterbot", "Slackbot", "Slackbot-LinkExpanding",
  "Discordbot", "WhatsApp", "TelegramBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: previewBots, allow: "/" },
      { userAgent: "*", disallow: "/" },
    ],
  };
}
