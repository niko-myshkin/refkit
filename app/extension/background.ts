import { flush, updateBadge } from './send'

// Фоновый скрипт: пока очередь не пуста, раз в минуту пробует отправить; счётчик на иконке держит в порядке
chrome.runtime.onInstalled.addListener(() => { void chrome.alarms.create('flush', { periodInMinutes: 1 }); void updateBadge() })
chrome.runtime.onStartup.addListener(() => { void chrome.alarms.create('flush', { periodInMinutes: 1 }); void flush() })
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'flush') void flush() })
// Окно положило страницу в очередь — пробуем сразу, вдруг сервер уже поднялся
chrome.runtime.onMessage.addListener((message) => {
  if (message === 'flush') void flush()
})
