# Push Subscriber

A simple API + state machine for interacting with the browser [PushManager](https://developer.mozilla.org/en-US/docs/Web/API/PushManager) API.


## Setup Subscriber

In your web app:

```ts
import { PushSubscriber, SubscriptionState } from '@kyeotic/push-subscriber'



const client = new PushSubscriber(
  appPublicKey,
  // If a subscription already exists, this will fire after init()
  (sub) => onUpdate(sub)
)

await client.init()

// Create a new subscription
// You don't need to call this if you already have one!
const newSubscription = await client.subscribeDevice()

// Remove an existing subscription
await client.unsubscribeDevice()

// Handle subscription changes, including client initialization
async function onUpdate(subscription: PushSubscription | null) {
  if (!subscription) {
    // handle deletion/cleanup if a previous subscription was saved
  } else {
    // save the subscription to your server
  }
}
```

## Setup Listener

In your service worker:

```ts
import { PushListener } from '@kyeotic/push-subscriber'

new PushListener({
  handleNotificationClick(event: NotificationEvent) {
    event.waitUntil(clients.openWindow(event.notification?.data?.url ?? '/'))
    console.log('Notification clicked.')
    event.notification.close()
  },
  handlePushEvent(event: PushEvent) {
    // console.log('Push message received.')
    let notificationTitle = 'Hello'
    const notificationOptions = {
      body: 'Thanks for sending this push msg.',
      icon: './apple-touch-icon.png',
      badge: './favicon-32x32.png',
      data: {
        url: 'https://$YOUR_DOMAIN',
      },
    }

    if (event.data) {
      const payload = JSON.parse(event.data.text()) as WebPushPayload
      notificationTitle = payload.title
      notificationOptions.body = payload.body
    }

    event.waitUntil(
      self.registration.showNotification(
        notificationTitle,
        notificationOptions,
      ),
    )
  },
})


```