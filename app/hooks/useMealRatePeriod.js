'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { mealRatePeriodDocumentId } from '@/lib/mealRate';

export default function useMealRatePeriod(month) {
  const [state, setState] = useState({ month: '', period: null, loading: Boolean(month) });

  useEffect(() => {
    if (!month) {
      setState({ month: '', period: null, loading: false });
      return undefined;
    }

    setState({ month, period: null, loading: true });
    return onSnapshot(
      doc(db, 'meals', mealRatePeriodDocumentId(month)),
      (snapshot) => {
        setState({
          month,
          period: snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null,
          loading: false,
        });
      },
      (error) => {
        console.error('Meal rate period listener failed:', error);
        setState({ month, period: null, loading: false });
      }
    );
  }, [month]);

  if (state.month !== month) {
    return { period: null, loading: Boolean(month), loadedMonth: '' };
  }
  return { period: state.period, loading: state.loading, loadedMonth: state.loading ? '' : state.month };
}
