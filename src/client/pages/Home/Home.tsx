import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteName } from '@client/router/route-name';

const Home = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Immediate redirect
    navigate(`/${RouteName.instance}`, { replace: true });
  }, [navigate]);

  return <></>; // or a loading spinner
};

export default Home;
