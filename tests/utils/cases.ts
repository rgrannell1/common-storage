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

import * as Peach from "https://raw.githubusercontent.com/rgrannell1/peach.ts/main/src/mod.ts";

const text = Peach.String.from(
  Peach.String.letters(Peach.Number.uniform),
  Peach.Number.uniform(0, 64),
);

const contents = Peach.Array.from(
  Peach.Object.from(text, text, Peach.Number.uniform(1, 10)),
  Peach.Number.uniform(0, 512),
);

export class TestCases {
  static *topics(take: number) {
    for (let idx = 0; idx < take; idx++) {
      yield {
        topic: text(),
        description: text(),
      };
    }
  }
  static *subscriptions(take: number) {
    for (let idx = 0; idx < take; idx++) {
      yield {
        id: text(),
      };
    }
  }
  static *content(take: number) {
    for (let idx = 0; idx < take; idx++) {
      yield {
        topic: text(),
        description: text(),
        content: contents(),
      };
    }
  }
}
