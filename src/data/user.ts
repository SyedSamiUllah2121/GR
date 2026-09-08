/**
 * The signed-in user.
 *
 * Sign-in is a demo gate rather than a real account system, so there is one
 * profile here for the chrome to show. When accounts arrive, this is the shape
 * the session should hand back.
 */
export interface AppUser {
  name: string;
  role: string;
  /** Shown in the avatar when there is no photo. */
  initials: string;
}

export const CURRENT_USER: AppUser = {
  name: 'Sami Ghani',
  role: 'Operations',
  initials: 'SG',
};

/** The operator the branches belong to, shown at the foot of the rail. */
export const ORGANISATION = {
  name: 'Royal Gujrat',
  tagline: 'Restaurant & Sweets',
};
