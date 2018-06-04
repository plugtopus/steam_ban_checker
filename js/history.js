var lastRecordedGameTime = 0;
var rightNow = Number(new Date);
var emptyStorage = false;
var allRecordedGames;

function Game(time, appid, players) {
  this.time = time;
  this.appid = appid;
  this.players = players;
  this.lastScanTime = 0;
}

function Player(miniprofile, name, ban) {
  this.miniprofile = miniprofile;
  this.name = name;
  this.bannedAfterRecording = ban;
  this.steamid = playerSteamID64(miniprofile);
}

function playerSteamID64(miniprofile) {
  return "76" + (parseInt(miniprofile) + 561197960265728);
}

function gameTimeStamp(steamTime) {
  var regex = /on (.+) (\d+) @ (\d+):(\d+) (\w\w)/;
  var match = regex.exec(steamTime);

  if (match !== null) {
    var date = new Date();
    var year = date.getFullYear();
    var month = match[1];
    var day = match[2];
    var hours = match[3];
    var minutes = match[4];
    if (match[5] == "PM") hours = (parseInt(hours) + 12) % 24;
    if (month == "Dec" && date.getMonth() == 1) {
      year--;
    }
    return Number(new Date(`${day} ${month} ${year} ${hours}:${minutes}`));
  } else {
    regex = /Played today @ (\d+):(\d+) (\w\w)/;
    match = regex.exec(steamTime);
    if (match !== null) {
      var hours = match[1];
      var minutes = match[2];
      if (match[3] == "PM") hours = (parseInt(hours) + 12) % 24;
      var now = new Date();
      var gameTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
      return Number(gameTime);
    }
  }
}

function scanPage(pageNumber, gamesArray, pagesAvailable) {
  var thisPageHasOldGames = false;
  fetch("http://steamcommunity.com/my/friends/coplay/?p=" + pageNumber + "&l=en", {
      credentials: 'include'
    })
    .then((response) => response.text())
    .then(function (htmlString) {
      var parser = new DOMParser();
      htmlDOM = parser.parseFromString(htmlString, "text/html");
      htmlDOM.querySelectorAll(".coplayGroup").forEach(function (coplayGroup) {
        var gameTime = gameTimeStamp(coplayGroup.querySelector(".gameListRowItem").textContent);
        if (gameTime <= lastRecordedGameTime) {
          thisPageHasOldGames = true;
          return;
        } else {
          var steamAppLink = coplayGroup.querySelector(".gameLogo > a").getAttribute("href");
          var steamAppID = steamAppLink.substring(steamAppLink.lastIndexOf("/") + 1, steamAppLink.length);
          var players = [];

          coplayGroup.querySelectorAll('.friendBlock').forEach(function (playerBlock) {
            var miniprofile = playerBlock.getAttribute("data-miniprofile");
            var name = playerBlock.querySelector(":nth-child(4)").firstChild.nodeValue.trim();
            if (players.filter(e => e.miniprofile == miniprofile).length == 0) {
              players.push(new Player(miniprofile, name, false));
            }
          });

          var thisGame = new Game(gameTime, steamAppID, players);
          gamesArray.push(thisGame);
        }

      });
      console.log("Page " + pageNumber + " scanned.");
      if (pageNumber < pagesAvailable && !thisPageHasOldGames) {
        scanPage(pageNumber + 1, gamesArray, pagesAvailable);
      } else {
        if (thisPageHasOldGames) console.log("Эта страница содержала одну или несколько игр, которые уже были отсканированы, не нужно сканировать следующие страницы.")
        console.log("Все страницы были отсканированы, теперь все сохраняется для хранения.");
        doneScanning(gamesArray);
      }
    });
}

function pagesToScan(gamesArray) {
  fetch("http://steamcommunity.com/my/friends/coplay?l=ru", {
      credentials: 'include'
    })
    .then((response) => response.text())
    .then(function (htmlString) {
      var parser = new DOMParser();
      htmlDOM = parser.parseFromString(htmlString, "text/html");
      if (htmlDOM.querySelector(".pagingPageLink") == undefined) {
        pagesAvailable = 1;
      } else {
        var pagination = htmlDOM.querySelectorAll(".pagingPageLink");
        pagesAvailable = pagination[pagination.length - 1].text;
      }
      console.log("Начало сканирования страницы. " + pagesAvailable + " доступные страницы.");
      scanPage(1, gamesArray, pagesAvailable);
    });
}

function doneScanning(gamesArray) {
  gamesArray.sort(function (a, b) {
    return b.time - a.time;
  });
  if (emptyStorage) {
    allRecordedGames = gamesArray;
  } else {
    allRecordedGames = gamesArray.concat(allRecordedGames);
  }
  chrome.storage.local.set({
    'games': allRecordedGames
  }, function () {
    console.log("Сохранить " + gamesArray.length + " новая игра" + (gamesArray.length == 1 ? "." : "."));
    console.log("Теперь начните проверку записанных профилей для банов...");
    banCheckProfiles();
  });
}

function startScanningRoutine() {
  chrome.storage.local.get('games', function (data) {
    allRecordedGames = data.games;
    console.log(allRecordedGames);
    if (typeof allRecordedGames === 'undefined' || allRecordedGames.length === 0) {
      emptyStorage = true;
    } else {
      emptyStorage = false; // important!
      lastRecordedGameTime = allRecordedGames[0].time;
    }
    console.log("Последняя записаная игра: " + lastRecordedGameTime);
    var gamesArray = [];
    pagesToScan(gamesArray);
  });
}


function scanGames(players, games, apikey, iteration) {
  var startFrom = 0;
  if (players.length > 100) {
    startFrom = iteration * 100;
  }
  listOfSteamID64 = [];
  for (var i = startFrom; i < (startFrom + 100); i++) {
    if (i >= players.length) break;
    listOfSteamID64.push(players[i].steamid);
  }
  fetchURL = 'https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=' + apikey +
    '&steamids=' + listOfSteamID64.join(',');
  fetch(fetchURL)
    .then(response => response.json())
    .then(function (response) {
      response.players.forEach(function (player) {
        if (player.NumberOfVACBans > 0 || player.NumberOfGameBans > 0) {
          var timeSinceLastBan = player.DaysSinceLastBan * 24 * 60 * 60 * 1000;
          var endOfToday = Number(new Date().setHours(23, 59, 59, 999));
          var timeLastBan = endOfToday - timeSinceLastBan;

          var gameRecordedTime;
          games.forEach(function (game) {
            game.players.forEach(function (gamePlayer) {
              if (gamePlayer.steamid == player.SteamId) {
                gameRecordedTime = game.time;
                if (timeLastBan > gameRecordedTime) {
                  Busted(gamePlayer, player.NumberOfVACBans, player.NumberOfGameBans, timeLastBan);
                }
              }
            });
          });
        }
      });
      if (players.length > iteration * 100 + 100) {
        setTimeout(function () {
          scanGames(players, games, apikey, iteration + 1);
        }, 1000);
      } else {
        var rightNow = Number(new Date());
        games.forEach(function (gameScanned) {
          var indexOfScannedGame = -1;
          for (var i = 0; i < allRecordedGames.length; i++) {
            if (allRecordedGames[i].time == gameScanned.time &&
              allRecordedGames[i].appid == gameScanned.appid &&
              allRecordedGames[i].players.length == gameScanned.players.length
            ) {
              indexOfScannedGame = i;
              break;
            }
          }
          if (indexOfScannedGame > -1) {
            console.log(allRecordedGames[indexOfScannedGame]);
            allRecordedGames[indexOfScannedGame].lastScanTime = rightNow;
          }
        });
        console.log(allRecordedGames);
        console.log("Обновление времени сканирования игр");
        chrome.storage.local.set({
          'lastTimeScanned': rightNow,
          'games': allRecordedGames
        }, function () {
          console.log("Закончить сейчас.");
        });
      }
    });
}

function Busted(player, vacBans, gameBans, timeLastBan) {
  var notified = false;
  var steamIdToFind = player.steamid;
  allRecordedGames.forEach(function (game) {
    game.players.forEach(function (player) {
      if (player.steamid == steamIdToFind) {
        player.numberOfVacBans = vacBans;
        player.numberOfGameBans = gameBans;
        player.lastBanTime = timeLastBan;
        if (!player.bannedAfterRecording) {
          player.bannedAfterRecording = true;
          if (!notified) {
            notified = true;
            BanNotification(player, game, vacBans, gameBans);
          }
        }
      }
    });
  });
  console.log("Помеченые забанные игроки.");
}

function BanNotification(player, game, vacBans, gameBans) {
  chrome.permissions.contains({
    permissions: ['notifications']
  }, function (notificationsGranted) {
    if (notificationsGranted) {
      chrome.storage.sync.get(["notificationsSetting"], function (data) {
        if (typeof data['notificationsSetting'] == 'undefined' || data.notificationsSetting == 'false') {
          console.log('У нас есть разрешения для уведомлений, но настройки были отключены.');
        } else {
          var name = player.name;
          var lastTimePlayed = new Date(game.time);
          var banType = "Забанен";
          if (vacBans == 0) {
            if (game.appid == 730) {
              banType = "Бан Патруля";
            } else {
              banType = "Игровой бан";
            }
          } else if (gameBans == 0) {
            banType = "VAC бан";
          }
          var text = "Игрок " + name + " Имеет " + banType + ". Последний раз когда вы играли вместе: " + lastTimePlayed + ".";
          chrome.notifications.clear("banchecker_ban_notification", function () {
            var notificationObj = {
              type: "basic",
              title: "Статистика матчей и проверка банов для Steam",
              message: text,
              iconUrl: "stats.png"
            };
            chrome.notifications.create("banchecker_ban_notification", notificationObj, function () {
              console.log("Notification sent.");
            });
          });
        }
      });
    } else {
      console.log("Разрешения на уведомления не были предоставлены.");
    }
  });
}

function testNotification() {
  chrome.storage.local.get('games', function (data) {
    var game = data.games[0];
    var player = game.players[0];
    BanNotification(player, game, 5, 0);
    setTimeout(function () {
      BanNotification(player, game, 0, 5);
      setTimeout(function () {
        BanNotification(player, game, 5, 5);
      }, 5000);
    }, 5000);
  });
}

function banCheckProfiles() {
  var providedCustomAPIKey = false;

  chrome.storage.sync.get(["customapikey"], function (data) {
      if (typeof data['customapikey'] == 'undefined') {
        var defaultkeys = ["5DA40A4A4699DEE30C1C9A7BCE84C914",
          "5970533AA2A0651E9105E706D0F8EDDC",
          "2B3382EBA9E8C1B58054BD5C5EE1C36A"
        ];
        var apikey = defaultkeys[Math.floor(Math.random() * 3)];
      } else {
        providedCustomAPIKey = true;
        var apikey = data['customapikey'];
      }

      if (!providedCustomAPIKey) {
        chrome.storage.local.get(["lastTimeScanned"], function (lastTimeScannedData) {
          console.log("Последнее сканирование было: " + new Date(lastTimeScannedData.lastTimeScanned));
          var rightNow = Number(new Date());
          var yesterdaySameTime = rightNow - 24 * 60 * 60 * 1000;
          if (lastTimeScannedData.lastTimeScanned > yesterdaySameTime && lastTimeScannedData.lastTimeScanned != undefined) {
            console.log("Никакой пользовательский API Key не предоставлен или не прошло достаточно времени после последнего сканирования.");
            return;
          } else {
            if (lastTimeScannedData.lastTimeScanned == undefined) lastTimeScannedData.lastTimeScanned = 0;
            if (typeof allRecordedGames === 'undefined' || allRecordedGames.length === 0) {
              console.log("Нечего сканировать, память пуста.")
            } else {
              var gamesToScan = [];
              var playersToScan = [];
              allRecordedGames.forEach(function (game) {
                if (playersToScan.length > 99) return;
                game.players.forEach(function (player) {
                  if (playersToScan.length > 99) {
                    return;
                  } else {
                    playersToScan.push(player);
                  }
                });
                gamesToScan.push(game);
              });
              console.log("Теперь эти игроки будут отсканированы:");
              console.log(playersToScan);
              console.log("Из этих игр:");
              console.log(gamesToScan);
              scanGames(playersToScan, gamesToScan, apikey, 0);
            }
          }
        });
      } else {
        if (typeof allRecordedGames === 'undefined' || allRecordedGames.length === 0) {
          console.log("Нечего сканировать, память пуста.")
        } else {
          var BatchesOfGamesToScan = [];
          var gamesToScan = [];
          var playersToScan = [];
          var lastScannedGameTime;

          allRecordedGames.forEach(function (game) {
            if (playersToScan.length > 199) return;
            game.players.forEach(function (player) {
              if (playersToScan.length > 199) {
                return;
              } else {
                playersToScan.push(player);
              }
            });
            gamesToScan.push(game);
          });

          chrome.storage.local.get('lastScannedGameTime', function (dataL) {
              if (typeof dataL.lastScannedGameTime === 'undefined') {
                console.log("Нет времени, записанного в предыдущих играх.");
                lastScannedGameTime = gamesToScan[gamesToScan.length - 1].time;
              } else {
                lastScannedGameTime = dataL.lastScannedGameTime;
                if (gamesToScan[gamesToScan.length - 1].time < lastScannedGameTime) {
                  lastScannedGameTime = gamesToScan[gamesToScan.length - 1].time
                }
              }

              var lastGame = false;
              allRecordedGames.forEach(function (game) {
                if (lastScannedGameTime < game.time) {
                  return;
                } else if (lastScannedGameTime == game.time) {
                  lastGame = true;
                }
                if (playersToScan.length > 999) return;
                game.players.forEach(function (player) {
                  if (playersToScan.length > 999) {
                    return;
                  } else {
                    playersToScan.push(player);
                  }
                });
                gamesToScan.push(game);
                lastScannedGameTime = game.time;
              });
              chrome.storage.local.set({
                  'lastScannedGameTime': lastScannedGameTime
                }, function () {
                  console.log("Теперь эти игроки будут проверяться:); console.log(playersToScan);
                    console.log("Из этих игр:"); console.log(gamesToScan); scanGames(playersToScan, gamesToScan, apikey, 0);
                  });
              });
          }
        }
      });
  }

  chrome.alarms.create("historyRecordRoutine", {
    delayInMinutes: 5,
    periodInMinutes: 120
  });

  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name == "historyRecordRoutine") {
      startScanningRoutine();
    }
  });

  function cmpVersions(a, b) {
    let diff;
    const regExStrip0 = /(\.0+)+$/;
    const segmentsA = a.replace(regExStrip0, '').split('.');
    const segmentsB = b.replace(regExStrip0, '').split('.');
    const l = Math.min(segmentsA.length, segmentsB.length);

    for (let i = 0; i < l; i++) {
      diff = parseInt(segmentsA[i], 10) - parseInt(segmentsB[i], 10);
      if (diff) {
        return diff;
      }
    }
    return segmentsA.length - segmentsB.length;
  }

  chrome.runtime.onInstalled.addListener(function (details) {
    console.log(details.previousVersion);
    if (cmpVersions(details.previousVersion, '1.6.18') <= 0) {
      console.log("обнаружена старая версия, удалите данные хранения ...");
      chrome.storage.local.clear();
    }
  });