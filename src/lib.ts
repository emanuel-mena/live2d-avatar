import { Live2DAvatarElement } from "./element";

export const LIVE2D_AVATAR_TAG = "live2d-avatar";

if (!customElements.get(LIVE2D_AVATAR_TAG)) {
  customElements.define(LIVE2D_AVATAR_TAG, Live2DAvatarElement);
}

export { Live2DAvatarElement };
