import React, { type FormEvent, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@client/store';
import { StoreEnum } from '@client/store/store.enum';
import authSlice from '@client/store/auth.slice';
import { AUTH_STATE_ERROR, AUTH_STATE_LOADING, IS_AUTHENTICATED } from '@client/store/auth.constants';
import { LOGIN } from '@server/api/auth/auth.map';
import { useTranslation } from 'react-i18next';
import Button from '@components/Button/Button';
import TextField from '@components/Fields/TextField/TextField';
import Form from '@components/Form/Form';
import { RegexPattern } from '@client-constants';

const LoginForm = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const {
    [AUTH_STATE_LOADING]: loading,
    [AUTH_STATE_ERROR]: error,
    [IS_AUTHENTICATED]: isAuthenticated,
  } = useSelector((state: RootState) => state[StoreEnum.auth]);

  const { [LOGIN]: login } = authSlice;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch(login({ email, password }));
  };

  return isAuthenticated ? null : (
    <Form className="w-96 m-auto py-16" name="login" onSubmit={handleSubmit}>
      <div className="flex gap-2 flex-col">
        <TextField
          name="email"
          type="email"
          label={t('GENERAL.EMAIL')}
          value={email}
          rules={{ required: [true], regex: [RegexPattern.EMAIL] }}
          pattern={RegexPattern.EMAIL_INPUT}
          onChange={setEmail}
        />

        <TextField
          name="password"
          type="password"
          label={t('GENERAL.PASSWORD')}
          value={password}
          rules={{ required: [true] }}
          onChange={setPassword}
        />

        <Button className="mt-8" type="submit" disabled={loading}>
          {t('GENERAL.LOGIN')}
        </Button>

        {error && <p className="text-red-700">{error.errorMessage?.[0].message}</p>}
      </div>
    </Form>
  );
};

export default LoginForm;
