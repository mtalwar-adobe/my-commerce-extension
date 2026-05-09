import { register } from '@adobe/uix-guest';
import { useEffect } from 'react';
import { MainPage } from './MainPage';
import { extensionId } from './Constants';

export default function ExtensionRegistration (props) {
  useEffect(() => {
    (async () => {
      await register({ id: extensionId, methods: {} });
    })();
  }, []);

  return <MainPage />;
}
