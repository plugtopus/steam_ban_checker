let context_api, tabs_api;
if (chrome) {
  context_api = chrome.contextMenus;
  tabs_api = chrome.tabs;
} else if (browser) {
  context_api = browser.menus;
  tabs_api = browser.tabs;
} else {
  throw new Error('Не удалось найти расширение браузера sdk');
}

const actions = {
  'csgo-matches': 'https://steamcommunity.com/my/gcpd/730?tab=matchhistorycompetitive',
  'community-friends': 'https://steamcommunity.com/my/friends/',
  'community-groups': 'https://steamcommunity.com/my/groups/',
  'community-recently': 'https://steamcommunity.com/my/friends/coplay/'
};
const context_listener = (info, tab) => {
  if (info.menuItemId in actions) {
    tabs_api.create({
      'url': actions[info.menuItemId]
    });
  }
};
const context_defs = [{
    id: 'community-friends',
    type: 'normal',
    title: 'Steam Друзья'
  },
  {
    id: 'community-groups',
    type: 'normal',
    title: 'Steam группы'
  },
  {
    id: 'community-recently',
    type: 'normal',
    title: 'Недавно играли вместе'
  },
  {
    id: 'csgo-matches',
    type: 'normal',
    title: 'CS:GO история матчей'
  },
  {
    id: 'separator-1',
    type: 'separator'
  }
];
context_defs.forEach((context) => {
  context['contexts'] = ['browser_action', 'page_action'];
  context_api.create(context);
})
context_api.onClicked.addListener(context_listener);