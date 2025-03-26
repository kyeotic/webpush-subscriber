// Based on https://github.com/gauntface/simple-push-demo/blob/main/frontend/scripts/push-client.js Apache License 2.0

export type SubscriptionState =
  (typeof PushSubscriber)['STATES'][keyof (typeof PushSubscriber)['STATES']]

/**
 * Wraps the `pushManager.getSubscription` API in a simple state machine with callback hooks
 */
export class PushSubscriber {
  public static STATES = {
    UNSUPPORTED: {
      id: 'UNSUPPORTED',
      interactive: false,
      pushEnabled: false,
    },
    INITIALIZING: {
      id: 'INITIALIZING',
      interactive: false,
      pushEnabled: false,
    },
    PERMISSION_DENIED: {
      id: 'PERMISSION_DENIED',
      interactive: false,
      pushEnabled: false,
    },
    PERMISSION_GRANTED: {
      id: 'PERMISSION_GRANTED',
      interactive: true,
    },
    PERMISSION_PROMPT: {
      id: 'PERMISSION_PROMPT',
      interactive: true,
      pushEnabled: false,
    },
    ERROR: {
      id: 'ERROR',
      interactive: false,
      pushEnabled: false,
    },
    STARTING_SUBSCRIBE: {
      id: 'STARTING_SUBSCRIBE',
      interactive: false,
      pushEnabled: true,
    },
    SUBSCRIBED: {
      id: 'SUBSCRIBED',
      interactive: true,
      pushEnabled: true,
    },
    STARTING_UNSUBSCRIBE: {
      id: 'STARTING_UNSUBSCRIBE',
      interactive: false,
      pushEnabled: false,
    },
    UNSUBSCRIBED: {
      id: 'UNSUBSCRIBED',
      interactive: true,
      pushEnabled: false,
    },
  } as const

  private readonly publicAppKey: Uint8Array<ArrayBuffer>

  constructor(
    publicAppKey: string,
    private readonly onUpdate: (subscription: PushSubscription | null) => void,
    private readonly onStateChange?: (
      state: SubscriptionState,
      reason?: string
    ) => void
  ) {
    // this.onStateChange?. = onStateChange
    // this.onUpdate = onUpdate

    this.publicAppKey = base64UrlToUint8Array(publicAppKey)

    if (!('serviceWorker' in navigator)) {
      this.onStateChange?.(
        PushSubscriber.STATES.UNSUPPORTED,
        'Service worker not ' + 'available on this browser'
      )
      return
    }

    if (!('PushManager' in window)) {
      this.onStateChange?.(
        PushSubscriber.STATES.UNSUPPORTED,
        'PushManager not ' + 'available on this browser'
      )
      return
    }

    if (!('showNotification' in ServiceWorkerRegistration.prototype)) {
      this.onStateChange?.(
        PushSubscriber.STATES.UNSUPPORTED,
        'Showing Notifications ' +
          'from a service worker is not available on this browser'
      )
      return
    }

    // this.init()
  }

  async init() {
    await navigator.serviceWorker.ready
    this.onStateChange?.(PushSubscriber.STATES.INITIALIZING)
    await this.setUpPushPermission()
  }

  private permissionStateChange(permissionState: NotificationPermission) {
    // If the notification permission is denied, it's a permanent block
    switch (permissionState) {
      case 'denied':
        this.onStateChange?.(PushSubscriber.STATES.PERMISSION_DENIED)
        break
      case 'granted':
        this.onStateChange?.(PushSubscriber.STATES.PERMISSION_GRANTED)
        break
      case 'default':
        this.onStateChange?.(PushSubscriber.STATES.PERMISSION_PROMPT)
        break
      default:
        console.error('Unexpected permission state: ', permissionState)
        break
    }
  }

  async setUpPushPermission() {
    try {
      this.permissionStateChange(Notification.permission)

      const reg = await navigator.serviceWorker.ready
      // Let's see if we have a subscription already
      const subscription = await reg.pushManager.getSubscription()
      // Update the current state with the
      // subscriptionId and endpoint
      this.onUpdate(subscription)
      if (!subscription) {
        // NOOP since we have no subscription and the permission state
        // will inform whether to enable or disable the push UI
        return
      }

      this.onStateChange?.(PushSubscriber.STATES.SUBSCRIBED)
    } catch (err) {
      console.error('setUpPushPermission() ', err)
      this.onStateChange?.(PushSubscriber.STATES.ERROR, (err as any)?.message)
    }
  }

  async subscribeDevice(): Promise<PushSubscription | null> {
    this.onStateChange?.(PushSubscriber.STATES.STARTING_SUBSCRIBE)

    try {
      switch (Notification.permission) {
        case 'denied':
          throw new Error('Push messages are blocked.')
        case 'granted':
          break
        default:
          if ((await Notification.requestPermission()) !== 'granted') {
            throw new Error('Bad permission result')
          }
      }

      // We need the service worker registration to access the push manager
      try {
        console.log('checking sw sub')
        const reg = await navigator.serviceWorker.ready
        console.log('worker ready')
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.publicAppKey,
        })
        console.log('sub collected')
        this.onStateChange?.(PushSubscriber.STATES.SUBSCRIBED)
        this.onUpdate(subscription)
        return subscription
      } catch (err) {
        console.error('subscribe device error', err)
        this.onStateChange?.(PushSubscriber.STATES.ERROR, (err as any)?.message)
      }
    } catch (err) {
      console.error('subscribeDevice() ', err)
      // Check for a permission prompt issue
      this.permissionStateChange(Notification.permission)
    }
    return null
  }

  async unsubscribeDevice() {
    // Disable the switch so it can't be changed while
    // we process permissions
    // window.PushDemo.ui.setPushSwitchDisabled(true);

    this.onStateChange?.(PushSubscriber.STATES.STARTING_UNSUBSCRIBE)

    try {
      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.getSubscription()

      // Check we have everything we need to unsubscribe
      if (!subscription) {
        this.onStateChange?.(PushSubscriber.STATES.UNSUBSCRIBED)
        this.onUpdate(null)
        return
      }

      // You should remove the device details from the server
      // i.e. the  pushSubscription.endpoint
      const successful = await subscription.unsubscribe()
      if (!successful) {
        // The unsubscribe was unsuccessful, but we can
        // remove the subscriptionId from our server
        // and notifications will stop
        // This just may be in a bad state when the user returns
        console.warn('We were unable to unregister from push')
      }

      this.onStateChange?.(PushSubscriber.STATES.UNSUBSCRIBED)
      this.onUpdate(null)
    } catch (err) {
      console.error(
        'Error thrown while revoking push notifications. ' +
          'Most likely because push was never registered',
        err
      )
    }
  }
}

export function base64UrlToUint8Array(
  base64UrlData: string
): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64UrlData.length % 4)) % 4)
  const base64 = (base64UrlData + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const buffer = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    buffer[i] = rawData.charCodeAt(i)
  }
  return buffer
}
