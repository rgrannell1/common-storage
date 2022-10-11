/*
 * Test the server works as expected (integration test)
 */

import { ServerTest } from "./utils/setup.ts";
import * as ContentGet from "./cases/routes/content-get.ts";
import * as FeedGet from "./cases/routes/feed-get.ts";
import * as TopicGet from "./cases/routes/topic-get.ts";
import * as TopicPost from "./cases/routes/topic-post.ts";
import * as ContentPost from "./cases/routes/content-post.ts";
import * as StorageTopic from "./cases/storage/topic.ts";

const content = [
  { name: "Abbott's babbler" },
  { name: "Abbott's booby" },
  { name: "Abbott's starling" },
  { name: "Abd al-Kuri sparrow" },
  { name: "Abdim's stork" },
  { name: "Aberdare cisticola" },
  { name: "Aberrant bush warbler" },
  { name: "Abert's towhee" },
  { name: "Abyssinian catbird" },
  { name: "Abyssinian crimsonwing" },
  { name: "Abyssinian ground hornbill" },
  { name: "Abyssinian ground thrush" },
  { name: "Abyssinian longclaw" },
  { name: "Abyssinian owl" },
  { name: "Abyssinian roller" },
  { name: "Abyssinian scimitarbill" },
  { name: "Abyssinian slaty flycatcher" },
  { name: "Abyssinian thrush" },
  { name: "Abyssinian waxbill" },
  { name: "Abyssinian wheatear" },
  { name: "Abyssinian white-eye" },
  { name: "Abyssinian woodpecker" },
  { name: "Acacia pied barbet" },
  { name: "Acacia tit" },
  { name: "Acadian flycatcher" },
  { name: "Aceh bulbul" },
  { name: "Acorn woodpecker" },
  { name: "Acre antshrike" },
  { name: "Acre tody-tyrant" },
  { name: "Adamawa turtle dove" },
  { name: "Adelaide's warbler" },
  { name: "Adélie penguin" },
  { name: "Admiralty cicadabird" },
  { name: "Afep pigeon" },
  { name: "Afghan babbler" },
  { name: "Afghan snowfinch" },
  { name: "African barred owlet" },
  { name: "African black duck" },
  { name: "African black swift" },
  { name: "African blue flycatcher" },
  { name: "African blue tit" },
  { name: "African broadbill" },
  { name: "African citril" },
  { name: "African collared dove" },
  { name: "African crake" },
  { name: "African crimson-winged finch" },
  { name: "African cuckoo" },
  { name: "African cuckoo-hawk" },
  { name: "African darter" },
  { name: "African desert warbler" },
  { name: "African dusky flycatcher" },
  { name: "African dwarf kingfisher" },
  { name: "African emerald cuckoo" },
  { name: "African finfoot" },
  { name: "African firefinch" },
  { name: "African fish eagle" },
  { name: "African golden oriole" },
  { name: "African goshawk" },
  { name: "African grass owl" },
  { name: "African green pigeon" },
  { name: "African grey flycatcher" },
  { name: "African grey hornbill" },
  { name: "African grey woodpecker" },
  { name: "African harrier-hawk" },
  { name: "African hawk-eagle" },
  { name: "African hill babbler" },
  { name: "African hobby" },
  { name: "African hoopoe" },
  { name: "African jacana" },
  { name: "African marsh harrier" },
  { name: "African olive pigeon" },
  { name: "African openbill" },
  { name: "African oystercatcher" },
  { name: "African palm swift" },
  { name: "African paradise flycatcher" },
  { name: "African penguin" },
  { name: "African piculet" },
  { name: "African pied hornbill" },
  { name: "African pied wagtail" },
  { name: "African pipit" },
  { name: "African pitta" },
  { name: "African pygmy goose" },
  { name: "African pygmy kingfisher" },
];

const suite = new ServerTest("sqlite");

/*
 * ContentGet
 */
suite.test(async (testParams) => {
  for (const topic of ["birds"]) {
    await ContentGet.testUnauthorised(testParams, { topic });
  }
});

await suite.test(async (testParams) => {
  for (const topic of ["birds"]) {
    await ContentGet.testMissingTopic(testParams, { topic });
  }
});

await suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds", description: "they fly" },
  ];

  for (const testData of tcases) {
    await ContentGet.testEmptyTopic(testParams, testData);
  }
});

await suite.test(async (testParams) => {
  const tcases = [
    {
      topic: "birds",
      description: "they fly",
      content,
    },
  ];

  for (const testData of tcases) {
    await ContentGet.testContentRetrieval(testParams, testData);
  }
});

/*
 * FeedGet
 */
suite.test(async (testParams) => {
  await FeedGet.testUnauthorised(testParams);
});

suite.test(async (testParams) => {
  await FeedGet.testFeed(testParams);
});

suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds", description: "they flap" },
  ];

  for (const tcase of tcases) {
    await FeedGet.testFeedStats(testParams, tcase);
  }
});




/*
 * TopicGet
 */
suite.test(async (testParams) => {
  for (const topic of ["birds"]) {
    await TopicGet.testUnauthorised(testParams, { topic });
  }
});

await suite.test(async (testParams) => {
  for (const topic of ["birds"]) {
    await TopicGet.testTopic(testParams, { topic });
  }
});

/*
 * TopicPost
 */
suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds", description: "they flap" },
  ];

  for (const tcase of tcases) {
    await TopicPost.testUnauthorised(testParams, tcase);
  }
});

await suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds", description: "they flap" },
  ];
  for (const tcase of tcases) {
    await TopicPost.testGetSet(testParams, tcase);
  }
});

/*
 * ContentPost
 */
await suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds" },
  ];
  for (const tcase of tcases) {
    await ContentPost.testUnauthorised(testParams, tcase);
  }
});

await suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds" },
  ];
  for (const tcase of tcases) {
    await ContentPost.testMalformed(testParams, tcase);
  }
});

await suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds", content },
  ];
  for (const tcase of tcases) {
    await ContentPost.testBatchWrites(testParams, tcase);
  }
});

await suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds" },
  ];
  for (const tcase of tcases) {
    await StorageTopic.testMissingTopic(testParams, tcase);
  }
});

await suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds", description: 'they flap' },
  ];
  for (const tcase of tcases) {
    await StorageTopic.testTopicAdd(testParams, tcase);
  }
});

await suite.test(async (testParams) => {
  const tcases = [
    { topic: "birds", description: 'they flap' },
  ];
  for (const tcase of tcases) {
    await StorageTopic.testTopicRetrieval(testParams, tcase);
  }
});
