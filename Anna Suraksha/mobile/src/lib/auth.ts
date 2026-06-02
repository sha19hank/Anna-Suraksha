import { Amplify } from 'aws-amplify';
import { signIn, signOut, signUp, confirmSignUp, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

export function configureAmplify() {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: process.env.EXPO_PUBLIC_USER_POOL_ID!,
        userPoolClientId: process.env.EXPO_PUBLIC_MOBILE_CLIENT_ID!,
        loginWith: { email: true },
      },
    },
  });
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.accessToken.toString() ?? null;
  } catch { return null; }
}

export { signIn, signOut, signUp, confirmSignUp, getCurrentUser };
