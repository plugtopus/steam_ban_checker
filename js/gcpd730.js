let continue_token = null;
let sessionid = null;
let profileURI = null;
let tabURIparam = 'matchhistorycompetitive';

const maxRetries = 3;

let providedCustomAPIKey = false;
let apikey = '';

const banStats = {
    vacBans: 0,
    gameBans: 0,
    recentBans: 0,
}

const funStats = {
    numberOfMatches: 0,
    totalKills: 0,
    totalAssists: 0,
    totalDeaths: 0,
    totalWins: 0,
    totalWaitTime: 0,
    totalTime: 0
}

const getSteamID64 = minProfile => '76' + (parseInt(minProfile) + 561197960265728);

const parseTime = (time) => {
    let timeSecs = 0;
    if (time.includes(':')) {
        const i = time.indexOf(':');
        timeSecs += parseInt(time.substr(0, i)) * 60;
        timeSecs += parseInt(time.substr(i + 1));
    } else {
        timeSecs += parseInt(time);
    }
    return timeSecs;
};
const timeString = (time) => {
    let secs = time;
    const days = Math.floor(secs / (24 * 60 * 60));
    secs %= 86400;
    const hours = Math.floor(secs / (60 * 60)).toString().padStart(2, '0');
    secs %= 3600;
    const mins = Math.floor(secs / 60).toString().padStart(2, '0');
    secs %= 60;
    secs = secs.toString().padStart(2, '0');

    let result = `${hours}:${mins}:${secs}`;
    if (days) result = `${days.toString()}д ${result}`;
    return result;
};

const statusBar = document.createElement('div');
statusBar.style.margin = '8px 0';
statusBar.style.whiteSpace = 'pre-wrap';
const updateStatus = (text, accumulate) => {
    if (accumulate) {
        statusBar.textContent = statusBar.textContent + '\n' + text;
    } else {
        statusBar.textContent = text;
    }
}

const initVariables = () => {
    const profileAnchor = document.querySelector('#global_actions .user_avatar');
    if (!profileAnchor) {
        updateStatus('Error: .user_avatar element was not found');
    }
    profileURI = profileAnchor.href;
    if (!document.querySelector('#load_more_button')) {
        updateStatus('No "LOAD MORE HISTORY" button is present, seems like there are no more matches');
    }
    const steamContinueScript = document.querySelector('#personaldata_elements_container+script');
    const matchContinueToken = steamContinueScript.text.match(/g_sGcContinueToken = '(\d+)'/);
    if (!matchContinueToken) {
        updateStatus('Error: g_sGcContinueToken was not found');
    }
    continue_token = matchContinueToken[1];
    const steamSessionScript = document.querySelector('#global_header+script');
    const matchSessionID = steamSessionScript.text.match(/g_sessionID = "(.+)"/);
    if (!matchSessionID) {
        updateStatus('Error: g_sessionID was not found');
    }
    sessionid = matchSessionID[1];
    const tabOnEl = document.querySelector('.tabOn');
    if (tabOnEl) {
        tabURIparam = tabOnEl.parentNode.id.split('_').pop();
    }
}

const funStatsBar = document.createElement('div');
funStatsBar.style.whiteSpace = 'pre-wrap';
const updateStats = () => {
    const profileURItrimmed = profileURI.replace(/\/$/, '');
    const myAnchors = document.querySelectorAll('.inner_name .playerAvatar ' +
        `a[href="${profileURItrimmed}"]:not(.banchecker-counted)`);
    myAnchors.forEach(anchorEl => {
        myMatchStats = anchorEl.closest('tr').querySelectorAll('td');
        funStats.totalKills += parseInt(myMatchStats[2].textContent, 10);
        funStats.totalAssists += parseInt(myMatchStats[3].textContent, 10);
        funStats.totalDeaths += parseInt(myMatchStats[4].textContent, 10);
        anchorEl.classList.add('banchecker-counted');
    });
    const matchesData = document.querySelectorAll('.val_left:not(.banchecker-counted)');
    funStats.numberOfMatches += matchesData.length;
    matchesData.forEach(matchData => {
        matchData.querySelectorAll('td').forEach((dataEl, index) => {
            if (index < 2) return;
            const data = dataEl.innerText.trim();
            if (data.includes(':')) {
                const i = data.indexOf(':');
                const value = data.substr(i + 1);
                if (index === 2) {
                    funStats.totalWaitTime += parseTime(value);
                } else if (index === 3) {
                    funStats.totalTime += parseTime(value);
                }
            }
        });
        matchData.classList.add('banchecker-counted');
    })
    funStatsBar.textContent = 'Ваша статистика матчей:\n' +
        `Количество матчей: ${funStats.numberOfMatches}\n` +
        `Всего убийств: ${funStats.totalKills}\n` +
        `Всего помощи в убийстве: ${funStats.totalAssists}\n` +
        `Всего смертей: ${funStats.totalDeaths}\n` +
        `K/D: ${(funStats.totalKills/funStats.totalDeaths).toFixed(3)} | ` +
        `(K+A)/D: ${((funStats.totalKills+funStats.totalAssists)/funStats.totalDeaths).toFixed(3)}\n` +
        `Общее время ожидания: ${timeString(funStats.totalWaitTime)}\n` +
        `Общее время матча: ${timeString(funStats.totalTime)}`;
}

const formatMatchTables = () => {
    document.querySelectorAll('.csgo_scoreboard_inner_right:not(.banchecker-formatted)').forEach(table => {
        const leftColumn = table.parentElement.parentElement.querySelector('.csgo_scoreboard_inner_left');
        const matchDate = leftColumn.textContent.match(/(20\d\d)-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/);
        let daysSinceMatch = -1;
        if (matchDate.length > 6) {
            const year = parseInt(matchDate[1], 10);
            const month = parseInt(matchDate[2], 10) - 1;
            const day = parseInt(matchDate[3], 10);
            const hour = parseInt(matchDate[4], 10);
            const minute = parseInt(matchDate[5], 10);
            const second = parseInt(matchDate[6], 10);
            const matchDateObj = new Date(year, month, day, hour, minute, second);
            const matchDayTime = matchDateObj.getTime();
            const currentTime = Date.now();
            const timePassed = currentTime - matchDayTime;
            daysSinceMatch = Math.ceil(timePassed / (1000 * 60 * 60 * 24));
        }
        table.querySelectorAll('tbody > tr').forEach((tr, i) => {
            if (i === 0 || tr.childElementCount < 3) return;
            const minProfile = tr.querySelector('.linkTitle').dataset.miniprofile;
            const steamID64 = getSteamID64(minProfile);
            tr.dataset.steamid64 = steamID64;
            tr.dataset.dayssince = daysSinceMatch;
            tr.classList.add('banchecker-profile');
        });
        table.classList.add('banchecker-formatted');
    });
}

const fetchMatchHistoryPage = (recursively, page, retryCount) => {
    document.querySelector('#load_more_button').style.display = 'none';
    document.querySelector('#inventory_history_loading').style.display = 'block';
    fetch(`${profileURI}gcpd/730?ajax=1&tab=${tabURIparam}&continue_token=${continue_token}&sessionid=${sessionid}`, {
            credentials: "same-origin"
        })
        .then(res => {
            if (res.ok) {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    return res.json();
                } else {
                    return res.text();
                }
            } else {
                throw Error(`Code ${res.status}. ${res.statusText}`);
            }
        })
        .then(json => {
            if (!json.success) {
                throw Error('error getting valid JSON in response to\n' +
                    `${profileURI}gcpd/730?ajax=1&tab=${tabURIparam}&continue_token=${continue_token}&sessionid=${sessionid}`);
            }
            if (json.continue_token) {
                continue_token = json.continue_token;
            } else {
                updateStatus('No continue_token returned from Steam, looks like there are no more matches to load!');
                continue_token = null;
            }
            const parser = new DOMParser();
            const newData = parser.parseFromString(json.html, 'text/html');
            newData.querySelectorAll('.csgo_scoreboard_root > tbody > tr').forEach((tr, i) => {
                if (i > 0) document.querySelector('.csgo_scoreboard_root').appendChild(tr);
            })
            updateStats();
            formatMatchTables();
            if (recursively && continue_token) {
                updateStatus(`Загружено ${page ? page + 1 : 1} страниц${page ? 'ы' : ''}...`);
                fetchMatchHistoryPage(true, page ? page + 1 : 1, maxRetries);
            } else {
                updateStatus('');
                if (!continue_token) {
                    document.querySelector('#inventory_history_loading').style.display = 'none';
                } else {
                    document.querySelector('#load_more_button').style.display = 'inline-block';
                    document.querySelector('#inventory_history_loading').style.display = 'none';
                }
            }
        })
        .catch((error) => {
            updateStatus(`Ошибка при загрузке истории:\n${error}` +
                `${retryCount !== undefined && retryCount > 0 ? `\n\nПовторная попытка получить страницу... ${maxRetries - retryCount}/3` 
                                                                   : `\n\nНе удалось загрузить данные ${maxRetries} retries :(`}`);
            if (retryCount > 0) {
                setTimeout(() => fetchMatchHistoryPage(true, page, retryCount - 1), 3000);
            }
            document.querySelector('#load_more_button').style.display = 'inline-block';
            document.querySelector('#inventory_history_loading').style.display = 'none';
        })
}

const fetchMatchHistory = () => {
    if (continue_token && sessionid && profileURI) {
        console.log(`First continue token: ${continue_token} | SessionID: ${sessionid} | Profile: ${profileURI}`);
        updateStatus('Загрузки истории матчей...');
        fetchMatchHistoryPage(true, 1, maxRetries);
    }
}

const checkBans = (players) => {
    const uniquePlayers = [...new Set(players)];
    let batches = uniquePlayers.reduce((arr, player, i) => {
        const batchIndex = Math.floor(i / 100);
        if (!arr[batchIndex]) {
            arr[batchIndex] = [player];
        } else {
            arr[batchIndex].push(player);
        }
        return arr;
    }, []);
    const fetchBatch = (i, retryCount) => {
        updateStatus(`Загруженные непроверенные матчи содержат ${uniquePlayers.length} игроков.\n` +
            `Мы можем сканировать 100 игроков одновременно, поэтому мы отправляем  ${batches.length} ` +
            `запросов${batches.length > 1 ? '' : ''}.\n` +
            `${i} успешные запросы${i === 1 ? '': ''}...`);
        fetch(`https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${apikey}&steamids=${batches[i].join(',')}`)
            .then(res => {
                if (res.ok) {
                    return res.json();
                } else {
                    throw Error(`Code ${res.status}. ${res.statusText}`);
                }
            })
            .then(json => {
                json.players.forEach(player => {
                    const playerEls = document.querySelectorAll(`tr[data-steamid64="${player.SteamId}"]`);
                    const daySinceLastMatch = parseInt(playerEls[0].dataset.dayssince, 10);
                    let verdict = '';
                    if (player.NumberOfVACBans > 0) {
                        verdict += 'VAC';
                        banStats.vacBans++;
                    }
                    if (player.NumberOfGameBans > 0) {
                        if (verdict) verdict += ' &\n';
                        verdict += 'Игр';
                        banStats.gameBans++;
                    }
                    if (verdict) {
                        const daysAfter = daySinceLastMatch - player.DaysSinceLastBan;
                        if (daySinceLastMatch > player.DaysSinceLastBan) {
                            banStats.recentBans++;
                            verdict += '+' + daysAfter;
                        } else {
                            verdict += daysAfter;
                        }
                    }
                    playerEls.forEach(playerEl => {
                        playerEl.classList.add('banchecker-checked');
                        verdictEl = playerEl.querySelector('.banchecker-bans');
                        if (verdict) {
                            if (daySinceLastMatch > player.DaysSinceLastBan) {
                                verdictEl.style.color = 'red';
                            } else {
                                verdictEl.style.color = 'grey';
                            }
                            verdictEl.style.cursor = 'help';
                            verdictEl.textContent = verdict;
                            verdictEl.title = `Дни с момента последнего бана: ${player.DaysSinceLastBan}`;
                        } else {
                            verdictEl.textContent = '';
                        }
                    })
                })
                if (batches.length > i + 1 && providedCustomAPIKey) {
                    setTimeout(() => fetchBatch(i + 1), 1000);
                } else if (batches.length > i + 1 && !providedCustomAPIKey) {
                    updateStatus('Вы не предоставили свой собственный Steam API Key, было проверено только 100 игроков!', true);
                } else {
                    updateStatus(`Ну, мы тут прикинули и вот результаты.\n\n` +
                        `Мы нашли: ${banStats.recentBans} игроков которые были забанены, после игры с вами!\n\n` +
                        `Общая статистика банов: ${banStats.vacBans} VAC бана в ${banStats.gameBans} ` +
                        `играх были забанены игроки.\n` +
                        `Общее количество уникальных игроков: ${uniquePlayers.length}` +
                        `\n\nНаведите мышкой на поле ("Баны") чтобы узнать сколько дней назад был забанен игрок.`);
                }
            })
            .catch((error) => {
                updateStatus(`Ошибка при сканировании забаненных игроков:\n${error}` +
                    `${retryCount !== undefined && retryCount > 0 ? `\n\nПовтор сканирования... ${maxRetries - retryCount}/3` 
                                                              : `\n\nНе удалось выполнить проверку банов ${maxRetries} повторить :(`}`);
                if (retryCount > 0) {
                    setTimeout(() => fetchBatch(i, retryCount - 1), 3000);
                }
            });
    }
    fetchBatch(0, maxRetries);
}

const checkLoadedMatchesForBans = () => {
    const tables = document.querySelectorAll('.banchecker-formatted:not(.banchecker-withcolumn)');
    tables.forEach(table => {
        table.classList.add('banchecker-withcolumn');
        table.querySelectorAll('tr').forEach((tr, i) => {
            if (i === 0) {
                const bansHeader = document.createElement('th');
                bansHeader.textContent = 'Баны';
                bansHeader.style.minWidth = '5.6em';
                tr.appendChild(bansHeader);
            } else if (tr.childElementCount > 3) {
                const bansPlaceholder = document.createElement('td');
                bansPlaceholder.classList.add('banchecker-bans');
                bansPlaceholder.textContent = '?';
                tr.appendChild(bansPlaceholder);
            } else {
                const scoreboard = tr.querySelector('td');
                if (scoreboard) scoreboard.setAttribute('colspan', '9');
            }
        });;
    })
    const playersEl = document.querySelectorAll('.banchecker-profile:not(.banchecker-checked):not(.banchecker-checking)');
    let playersArr = [];
    playersEl.forEach(player => {
        player.classList.add('banchecker-checking');
        playersArr.push(player.dataset.steamid64);
    })
    checkBans(playersArr);
}

const menu = document.createElement('div');
menu.style.padding = '0 14px';
menu.id = 'banchecker-menu';

const createSteamButton = (text, iconURI) => {
    const button = document.createElement('div');
    button.style.display = 'inline-block';
    button.style.backgroundColor = 'rgba( 103, 193, 245, 0.2 )';
    button.style.padding = '3px 8px 0px 0px';
    button.style.borderRadius = '2px';
    button.style.marginRight = '6px';
    button.style.cursor = 'pointer';
    button.style.lineHeight = '18px';
    button.style.color = '#66c0f4';
    button.style.fontSize = '11px';
    button.onmouseover = () => {
        button.style.backgroundColor = 'rgba( 102, 192, 244, 0.4 )';
        button.style.color = '#ffffff';
    }
    button.onmouseout = () => {
        button.style.backgroundColor = 'rgba( 103, 193, 245, 0.2 )';
        button.style.color = '#66c0f4';
    }
    const iconEl = document.createElement('div');
    iconEl.className = 'menu_ico';
    iconEl.style.display = 'inline-block';
    iconEl.style.verticalAlign = 'top';
    iconEl.style.padding = iconURI ? '1px 7px 0 6px' : '1px 8px 0 0';
    iconEl.style.minHeight = '22px';
    if (iconURI) {
        const image = document.createElement('img');
        image.src = iconURI;
        image.width = '16';
        image.height = '16';
        image.border = '0';
        iconEl.appendChild(image);
    }
    button.appendChild(iconEl);
    const textNode = document.createTextNode(text);
    button.appendChild(textNode);
    return button;
}

const fetchButton = createSteamButton('Загрузить всю историю матчей');
fetchButton.onclick = () => {
    fetchMatchHistory();
    fetchButton.onclick = () => {
        updateStatus('Эта кнопка уже нажата. Перезагрузите страницу, если хотите начать все заново..');
    }
}
menu.appendChild(fetchButton);

const checkBansButton = createSteamButton('Показать статистику по банам');
checkBansButton.onclick = () => {
    checkLoadedMatchesForBans();
    if (!providedCustomAPIKey) checkBansButton.onclick = null;
}
chrome.storage.sync.get(['customapikey'], data => {
    if (typeof data.customapikey === 'undefined') {
        const defaultkeys = [
            '5DA40A4A4699DEE30C1C9A7BCE84C914',
            '5970533AA2A0651E9105E706D0F8EDDC',
            '2B3382EBA9E8C1B58054BD5C5EE1C36A',
        ];
        apikey = defaultkeys[Math.floor(Math.random() * 3)];
        statusBar.textContent = 'Только 100 игроков из последних матчей будут отсканированы, без предоставления вашего собственного ключа API!'
    } else {
        providedCustomAPIKey = true;
        apikey = data.customapikey;
    }
    fetchButton.insertAdjacentElement('afterend', checkBansButton);
});


menu.appendChild(statusBar);
menu.appendChild(funStatsBar);

document.querySelector('#subtabs').insertAdjacentElement('afterend', menu);

initVariables();
formatMatchTables();
updateStats();

const loadMoreButton = document.querySelector('#load_more_button');
document.querySelector('.load_more_history_area').appendChild(loadMoreButton);
document.querySelector('.load_more_history_area a').remove();
loadMoreButton.onclick = () => fetchMatchHistoryPage(false, null, maxRetries);


// embed settings
let settingsInjected = false;
const showSettings = () => {
    if (settingsInjected) {
        const settingsShade = document.getElementById('settingsShade');
        const settingsDiv = document.getElementById('settingsDiv');
        settingsShade.className = 'fadeIn';
        settingsDiv.className = 'fadeIn';
    } else {
        settingsInjected = true;
        fetch(chrome.extension.getURL('../html/options.html'))
            .then((resp) => resp.text())
            .then(settingsHTML => {
                const settingsDiv = document.createElement('div');
                settingsDiv.id = 'settingsDiv';
                settingsDiv.innerHTML = settingsHTML;
                document.body.appendChild(settingsDiv);
                const settingsShade = document.createElement('div');
                settingsShade.id = 'settingsShade';
                settingsShade.addEventListener('click', hideSettings);
                document.body.appendChild(settingsShade);
                initOptions();
                showSettings();
            });
    }
}
const hideSettings = () => {
    const settingsShade = document.getElementById('settingsShade');
    const settingsDiv = document.getElementById('settingsDiv');
    settingsShade.className = 'fadeOut';
    settingsDiv.className = 'fadeOut';
    chrome.storage.sync.get(['customapikey'], data => {
        if (typeof data.customapikey !== 'undefined' && !providedCustomAPIKey) {
            location.reload();
        } else {
            updateStatus('Перезагрузите эту страницу если вы изменили API Key!');
        }
    });
}
const bancheckerSettingsButton = createSteamButton('Настроить Steam API Key');
bancheckerSettingsButton.onclick = () => showSettings();
statusBar.insertAdjacentElement('beforeBegin', bancheckerSettingsButton);