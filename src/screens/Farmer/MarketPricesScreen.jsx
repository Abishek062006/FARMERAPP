import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

export default function MarketPricesScreen({ navigation, route }) {
  const { cropName } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState(cropName || '');
  const [prices, setPrices] = useState([]);
  const [bestMarkets, setBestMarkets] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (searchQuery) {
      fetchPrices();
    }
  }, []);

  const fetchPrices = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      console.log('📊 Fetching market prices for:', searchQuery);

      // Fetch current prices
      const pricesResponse = await axios.get(
        `${API_ENDPOINTS.MARKET}/prices/${searchQuery.trim()}`
      );

      console.log('✅ Prices response:', pricesResponse.data);

      if (pricesResponse.data.success) {
        setPrices(pricesResponse.data.prices || []);
        
        // Get best markets (top 3 highest prices)
        const sortedPrices = [...(pricesResponse.data.prices || [])]
          .sort((a, b) => b.modalPrice - a.modalPrice)
          .slice(0, 3);
        setBestMarkets(sortedPrices);
      } else {
        setError('No prices found for this crop');
        setPrices([]);
        setBestMarkets([]);
      }
    } catch (error) {
      console.error('❌ Error fetching prices:', error);
      setError(error.response?.data?.message || 'Failed to fetch market prices');
      setPrices([]);
      setBestMarkets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPrices();
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      fetchPrices();
    }
  };

  const getTrendIcon = (trend) => {
    if (trend === 'increasing' || trend === 'up') {
      return { icon: 'trending-up', color: '#4CAF50' };
    }
    if (trend === 'decreasing' || trend === 'down') {
      return { icon: 'trending-down', color: '#F44336' };
    }
    return { icon: 'remove', color: '#666' };
  };

  const renderPriceItem = ({ item }) => {
    const trendInfo = getTrendIcon(item.trend);
    
    return (
      <View style={styles.priceCard}>
        <View style={styles.priceHeader}>
          <View style={styles.marketInfo}>
            <Text style={styles.marketName}>{item.market?.name || item.marketName}</Text>
            <Text style={styles.marketLocation}>
              {item.market?.district || item.district}, {item.market?.state || item.state || 'Tamil Nadu'}
            </Text>
          </View>
          <View style={styles.trendBadge}>
            <Ionicons name={trendInfo.icon} size={20} color={trendInfo.color} />
            {item.priceChange && item.priceChange !== 0 && (
              <Text style={[styles.priceChange, { color: trendInfo.color }]}>
                {item.priceChange > 0 ? '+' : ''}{item.priceChange}%
              </Text>
            )}
          </View>
        </View>
        
        <View style={styles.priceDetails}>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Modal Price</Text>
            <Text style={styles.priceValue}>₹{item.modalPrice}/{item.unit || 'quintal'}</Text>
          </View>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Min</Text>
            <Text style={styles.priceMin}>₹{item.minPrice}</Text>
          </View>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Max</Text>
            <Text style={styles.priceMax}>₹{item.maxPrice}</Text>
          </View>
        </View>
        
        <Text style={styles.priceDate}>
          Updated: {new Date(item.lastUpdated || item.date).toLocaleDateString('en-IN')}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search crop (e.g., Tomato, Rice, Onion)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setPrices([]);
              setBestMarkets([]);
              setError('');
            }}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity 
          style={styles.searchButton}
          onPress={handleSearch}
          disabled={!searchQuery.trim() || loading}
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Best Markets */}
      {bestMarkets.length > 0 && (
        <View style={styles.bestMarketsSection}>
          <Text style={styles.sectionTitle}>🏆 Best Markets Today</Text>
          {bestMarkets.map((market, index) => (
            <View key={index} style={styles.bestMarketItem}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>#{index + 1}</Text>
              </View>
              <View style={styles.bestMarketInfo}>
                <Text style={styles.bestMarketName}>
                  {market.market?.name || market.marketName}
                </Text>
                <Text style={styles.bestMarketLocation}>
                  {market.market?.district || market.district}
                </Text>
              </View>
              <Text style={styles.bestMarketPrice}>₹{market.modalPrice}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Price List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading prices...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={60} color="#F44336" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleSearch}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : prices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetag-outline" size={60} color="#ccc" />
          <Text style={styles.emptyText}>
            {searchQuery ? 'No prices found' : 'Search for a crop to see prices'}
          </Text>
          <Text style={styles.emptySubtext}>
            Try: Tomato, Rice, Onion, Potato, Wheat
          </Text>
        </View>
      ) : (
        <FlatList
          data={prices}
          renderItem={renderPriceItem}
          keyExtractor={(item, index) => item._id || index.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bestMarketsSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  bestMarketItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  bestMarketInfo: {
    flex: 1,
  },
  bestMarketName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  bestMarketLocation: {
    fontSize: 12,
    color: '#666',
  },
  bestMarketPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
  },
  priceCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  marketInfo: {
    flex: 1,
  },
  marketName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  marketLocation: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceChange: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  priceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  priceItem: {
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  priceMin: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F44336',
  },
  priceMax: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  priceDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
  },
});
