const loadMoreValue = 15;
var gamesShowingIndex = 0;

var banCheckerButton = document.createElement('a');
banCheckerButton.setAttribute('href', "//steamcommunity.com/my/friends/banchecker");
banCheckerButton.className = 'sectionTab';
var banCheckerButtonText = document.createElement('span');
banCheckerButtonText.appendChild(document.createTextNode('Проверка банов'));
banCheckerButton.appendChild(banCheckerButtonText);

var banCheckerMobileButton = document.createElement('option');
banCheckerMobileButton.value = "//steamcommunity.com/my/friends/banchecker";
banCheckerMobileButton.appendChild(document.createTextNode('Проверка банов'));
document.querySelector('.responsive_tab_select').appendChild(banCheckerMobileButton);

var settingsInjected = false;

function showSettings() {
  if (settingsInjected) {
    var settingsShade = document.getElementById('settingsShade');
    var settingsDiv = document.getElementById('settingsDiv');
    settingsShade.className = 'fadeIn';
    settingsDiv.className = 'fadeIn';
  } else {
    settingsInjected = true;
    fetch(chrome.extension.getURL('../html/options.html'))
      .then((resp) => resp.text())
      .then(function (settingsHTML) {
        var settingsDiv = document.createElement('div');
        settingsDiv.id = 'settingsDiv';
        settingsDiv.innerHTML = settingsHTML;
        document.body.appendChild(settingsDiv);
        var settingsShade = document.createElement('div');
        settingsShade.id = 'settingsShade';
        settingsShade.addEventListener('click', hideSettings);
        document.body.appendChild(settingsShade);
        initOptions();
        showSettings();
      });
  }
}

function hideSettings() {
  var settingsShade = document.getElementById('settingsShade');
  var settingsDiv = document.getElementById('settingsDiv');
  settingsShade.className = 'fadeOut';
  settingsDiv.className = 'fadeOut';
}

if (window.location.pathname.split("/").pop() == 'banchecker') {
  document.querySelector('.sectionTabs a:first-child').classList.remove('active');
  banCheckerButton.classList.add('active');
  renderBanCheker();
}
document.querySelector('.sectionTabs').appendChild(banCheckerButton);

function createPlayerElement(player) {
  var playerBody = document.createElement('div');
  playerBody.classList.add('friendBlock', 'persona');
  if (player.bannedAfterRecording) playerBody.classList.add('banned');
  playerBody.setAttribute('data-miniprofile', player.miniprofile);
  playerBody.setAttribute('href', "//steamcommunity.com/profiles/" + player.steamid);
  var friendBlockLinkOverlay = document.createElement('a');
  friendBlockLinkOverlay.href = '//steamcommunity.com/profiles/' + player.steamid;
  friendBlockLinkOverlay.className = 'friendBlockLinkOverlay';
  playerBody.appendChild(friendBlockLinkOverlay);
  var avatar = document.createElement('div');
  avatar.className = 'playerAvatar';
  // We'll load avatars like this so we don't waste Steam API calls
  fetch('//steamcommunity.com/profiles/' + player.steamid + '?xml=1')
    .then(response => response.text())
    .then(function (xml) {
      var regex = /http(?:s)?:\/\/(.+)_medium.jpg/;
      var avatarURLs = xml.match(regex);
      if (avatarURLs != null) {
        var avatarURL = avatarURLs[0];
        avatarImgTag = document.createElement('img');
        avatarImgTag.src = avatarURL;
        avatar.appendChild(avatarImgTag);
      }
      var thisPlayer = document.querySelectorAll('.friendBlock[data-miniprofile="' + player.miniprofile + '"]');
      thisPlayer.forEach(function (thisOne) {
        if (thisOne.querySelector('.playerAvatar') == null) {
          thisOne.insertAdjacentElement('afterbegin', avatar);
        };
      });
    });
  var name = document.createElement('div');
  name.appendChild(document.createTextNode(player.name));
  var playerStatus = document.createElement('span');
  playerStatus.className = 'friendSmallText';
  name.appendChild(document.createElement('br'));
  name.appendChild(playerStatus);
  if (player.bannedAfterRecording) {
    playerBody.style.backgroundColor = "rgba(230,0,0,0.3)";
    var daysSinceLastBan = (Date.now() - player.lastBanTime) / (1000 * 60 * 60 * 24);
    var daysSinceLastBanMessage = 'Забанен ' + Math.round(daysSinceLastBan) + ' days ago.';
    playerStatus.appendChild(document.createTextNode(daysSinceLastBanMessage));
  }
  playerBody.appendChild(name);
  return playerBody;
}

function createGameElement(game) {
  var gameBody = document.createElement('div');
  gameBody.className = 'coplayGroup';

  var gameInfo = document.createElement('div');
  gameInfo.className = 'gameListRow';

  var gameImage = document.createElement('div');
  gameImage.className = 'gameListRowLogo';

  var gameLogoHolder_default = document.createElement('div');
  gameLogoHolder_default.className = 'gameLogoHolder_default';
  var gameLogo = document.createElement('div');
  gameLogo.className = 'gameLogo';
  var logoLink = document.createElement('a');
  logoLink.href = '//steamcommunity.com/app/' + game.appid;
  var logoImg = document.createElement('img');
  logoImg.src = '//steamcdn-a.akamaihd.net/steam/apps/' + game.appid + '/header.jpg';
  logoLink.appendChild(logoImg);
  gameLogo.appendChild(logoLink);
  gameLogoHolder_default.appendChild(gameLogo);
  gameImage.appendChild(gameLogoHolder_default);

  var gameAbout = document.createElement('div');
  gameAbout.className = 'gameListRowItem';

  var gameAboutAppName = document.createElement('h4');
  gameAboutAppName.textContent = 'AppID: ' + game.appid;
  gameAbout.appendChild(gameAboutAppName);
  gameAbout.appendChild(document.createElement('br'));

  var textNodePlayed = document.createTextNode(
    'Played: ' + new Date(game.time)
  );
  gameAbout.appendChild(textNodePlayed);
  gameAbout.appendChild(document.createElement('br'));
  var textNodeScanned = document.createTextNode(
    'Время последнего сканирования: ' + ((game.lastScanTime == 0) ? 'Никогда' : new Date(game.lastScanTime))
  )
  gameAbout.appendChild(textNodeScanned);

  gameInfo.appendChild(gameImage);
  gameInfo.appendChild(gameAbout);
  gameBody.appendChild(gameInfo);

  playersBody = document.createElement('div');
  playersBody.className = 'responsive_friendblocks';

  game.players.forEach(function (player) {
    playersBody.appendChild(createPlayerElement(player));
  });

  gameBody.appendChild(playersBody);

  gameBody.insertAdjacentHTML('beforeend', '<div style="clear: left;"></div>');
  return gameBody;
}

// This function renders games that correspond to selected filters
// and continues to render next batches of games when needed
function gamesRendering(div, appid, bannedOnly, tenPlayers, allPages) {
  chrome.storage.local.get('games', function (data) {
    if (typeof data.games === 'undefined' || data.games.length === 0) {
      div.innerHTML = 'Нет записанных игр.';
    } else {
      if (gamesShowingIndex == data.games.length) {
        var message = document.querySelector('#paginationNoMore');
        message.style.visibility = 'visible';
        setTimeout(function () {
          message.style.visibility = 'hidden';
        }, 500);
        return;
      }
      div.classList.add('profile_friends');
      var lastGameToShowThisCycle;
      if (allPages) {
        lastGameToShowThisCycle = data.games.length;
      } else {
        lastGameToShowThisCycle = gamesShowingIndex + loadMoreValue;
      }
      for (var i = gamesShowingIndex; i < lastGameToShowThisCycle && i < data.games.length; i++) {
        var game = data.games[i];
        if ((appid == 0 || game.appid == appid) && (tenPlayers == false || (tenPlayers == true && game.players.length == 9))) {
          if (bannedOnly) {
            var showThis = false;
            game.players.forEach(function (player) {
              if (player.bannedAfterRecording) showThis = true;
            });
            if (showThis) {
              div.appendChild(createGameElement(game));
            } else lastGameToShowThisCycle++;
          } else {
            div.appendChild(createGameElement(game));
          }
        } else {
          lastGameToShowThisCycle++;
        }
        gamesShowingIndex++;
      }
    }
  });
}

function initiateGamesRendering(div, appid, bannedOnly, tenPlayers) {
  div.innerHTML = '';
  gamesShowingIndex = 0;
  gamesRendering(div, appid, bannedOnly, tenPlayers, false);
}

function loadMore(allPages) {
  var appidFilter = document.querySelector('#appidFilter');
  var newFilter = document.querySelector('#gamesAvailable').value;
  var mainDiv = document.querySelector('div.main');
  var bannedOnly = document.querySelector('#checkbox').checked;
  if (newFilter == 'custom') {
    document.querySelector('#appidFilter').style.display = 'inline';
    newFilter = appidFilter.value;
  } else {
    document.querySelector('#appidFilter').style.display = 'none';
  }
  switch (newFilter) {
    case '730_ten':
      gamesRendering(mainDiv, 730, bannedOnly, true, allPages);
      break;
    default:
      gamesRendering(mainDiv, newFilter, bannedOnly, false, allPages);
      break;
  }
}

function applyFilter() {
  var appidFilter = document.querySelector('#appidFilter');
  var newFilter = document.querySelector('#gamesAvailable').value;
  var mainDiv = document.querySelector('div.main');
  var bannedOnly = document.querySelector('#checkbox').checked;
  if (newFilter == 'custom') {
    document.querySelector('#appidFilter').style.display = 'inline';
    newFilter = appidFilter.value;
  } else {
    document.querySelector('#appidFilter').style.display = 'none';
  }
  switch (newFilter) {
    case '730_ten':
      initiateGamesRendering(mainDiv, 730, bannedOnly, true);
      break;
    default:
      initiateGamesRendering(mainDiv, newFilter, bannedOnly, false);
      break;
  }
}

function renderBanCheker() {
  var body = document.querySelector('.responsive_friendblocks_ctn');
  body.innerHTML = '';

  var extensionInfo = document.createElement('div');
  extensionInfo.style.paddingBottom = "1.5em";
  var InfoMessage = `<p>На этой странице будут показаны только те баны, которые произошли после того, как вы сыграли с игроком вместе.</p>
  <p>Расширение записывает игры периодически каждые несколько часов, они не появляются здесь сразу.</p>
  <p>С вашим собственным API Key, Steam будет периодически сканировать каждую записанную игру для последних банов.<br>
  Без ключа расширение будет сканировать только 100 игроков один раз в день. Вы можете установить свой ключ API в <span class="openSettings" style="text-decoration:underline; cursor:pointer">настройках</span>.</p>`;
  extensionInfo.innerHTML = InfoMessage;

  var filterGames = `<label style="padding-right: 4em"><input type="checkbox" id="checkbox">Игры с забаненными игроками</label>
  Выбрать игру:
  <select id="gamesAvailable">
    <option value="0">Все игры</option>
    <option value="730">CS:GO</option>
    <option value="730_ten">CS:GO с 10 игроками</option>
    <option value="570">Dota 2</option>
    <option value="440">Team Fortress 2</option>
    <option value="custom">Фильтровать по id игры</option>
  </select>
  <input id="appidFilter" style="display:none" type="text" value="" placeholder="Пример 730"/>`;
  extensionInfo.insertAdjacentHTML('beforeend', filterGames);
  body.appendChild(extensionInfo);

  var main = document.createElement('div');
  main.className = 'main';
  body.appendChild(main);

  var pagination = document.createElement('div');
  pagination.className = 'banchecker-pagination';
  pagination.innerHTML = `<input id="loadMore" type="button" value="Загрузить ` + loadMoreValue + ` больше игр">
  <input id="loadAll" type="button" value="Загрузите все игры (может зависнуть)">
  <div id="paginationNoMore" style="visibility:hidden; padding-top:.5em">Больше игр для загрузки нет.</div>`;
  body.appendChild(pagination);
  document.querySelector('#loadMore').addEventListener("click", function () {
    loadMore(false)
  });
  document.querySelector('#loadAll').addEventListener("click", function () {
    loadMore(true)
  });

  document.querySelector('#gamesAvailable').addEventListener("change", applyFilter);
  document.querySelector('#appidFilter').addEventListener("change", applyFilter);
  document.querySelector('#checkbox').addEventListener("change", applyFilter);

  document.querySelector('.openSettings').addEventListener('click', showSettings);

  initiateGamesRendering(main, 0, false, false);
}